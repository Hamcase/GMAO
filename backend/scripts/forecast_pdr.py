"""
PDR Forecasting with Real ML Models
Implements Prophet, ARIMA, and LSTM for spare parts demand forecasting
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Literal
import warnings
warnings.filterwarnings('ignore')

# Prophet
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    print("Warning: Prophet not installed. Run: pip install prophet")

# ARIMA/SARIMA
try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    from statsmodels.tsa.stattools import adfuller
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False
    print("Warning: statsmodels not installed. Run: pip install statsmodels")

# LSTM/GRU
try:
    import tensorflow as tf
    from tensorflow import keras
    from sklearn.preprocessing import MinMaxScaler
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    print("Warning: TensorFlow not installed. Run: pip install tensorflow")


class PDRForecaster:
    """Real ML-based forecasting for spare parts demand"""
    
    def __init__(self):
        self.model = None
        self.scaler = None
        self.model_type = None
    
    def calculate_mtbf(self, historical_data: List[Dict]) -> Optional[Dict]:
        """
        Calculate MTBF (Mean Time Between Failures) from intervention dates
        
        Args:
            historical_data: List of {month: 'YYYY-MM', quantity: int}
            
        Returns:
            Dict with MTBF stats or None if insufficient data
        """
        # Get all months where failures occurred (quantity > 0)
        failure_months = [d['month'] for d in historical_data if d['quantity'] > 0]
        
        if len(failure_months) < 2:
            return None  # Need at least 2 failures to calculate MTBF
        
        # Convert to dates and sort
        failure_dates = sorted([datetime.strptime(m + '-01', '%Y-%m-%d') for m in failure_months])
        
        # Calculate intervals between failures (in days)
        intervals = []
        for i in range(1, len(failure_dates)):
            interval_days = (failure_dates[i] - failure_dates[i-1]).days
            intervals.append(interval_days)
        
        if not intervals:
            return None
        
        mtbf_days = np.mean(intervals)
        mtbf_months = mtbf_days / 30.44  # Average days per month
        std_days = np.std(intervals)
        
        # Calculate failure rate (lambda)
        failure_rate = 1.0 / mtbf_months  # failures per month
        
        return {
            'mtbf_days': round(mtbf_days, 1),
            'mtbf_months': round(mtbf_months, 2),
            'std_days': round(std_days, 1),
            'failure_rate': round(failure_rate, 4),
            'n_failures': len(failure_dates),
            'min_interval_days': min(intervals),
            'max_interval_days': max(intervals),
            'reliability': 'high' if std_days / mtbf_days < 0.3 else 'medium' if std_days / mtbf_days < 0.6 else 'low'
        }
    
    def mtbf_forecast(self, mtbf_stats: Dict, horizon: int) -> Dict:
        """
        Generate forecast based on MTBF reliability theory
        
        Args:
            mtbf_stats: Output from calculate_mtbf()
            horizon: Number of months to forecast
            
        Returns:
            Dict with forecasts based on failure rate
        """
        failure_rate = mtbf_stats['failure_rate']  # λ per month
        mtbf_months = mtbf_stats['mtbf_months']
        
        forecasts = []
        for month_idx in range(1, horizon + 1):
            # Expected number of failures in this period
            # Using exponential distribution: E[failures] = λ × time
            expected_failures = failure_rate * month_idx
            
            # Confidence interval using Poisson distribution properties
            # For Poisson: variance = mean = λt
            std_dev = np.sqrt(expected_failures)
            
            forecasts.append({
                'month_offset': month_idx,
                'expected_failures': round(expected_failures, 2),
                'lower': max(0, round(expected_failures - 1.04 * std_dev, 2)),  # ~70% CI
                'upper': round(expected_failures + 1.04 * std_dev, 2)
            })
        
        return {
            'forecasts': forecasts,
            'method': 'mtbf',
            'mtbf_months': mtbf_months,
            'confidence': 'high' if mtbf_stats['n_failures'] >= 5 else 'medium' if mtbf_stats['n_failures'] >= 3 else 'low'
        }
        
    def prepare_data(
        self,
        historical_data: List[Dict],
        fill_gaps: bool = True
    ) -> pd.DataFrame:
        """
        Prepare historical data for forecasting
        
        Args:
            historical_data: List of {month: 'YYYY-MM', quantity: int}
            fill_gaps: Whether to fill missing months with 0
            
        Returns:
            DataFrame with 'ds' (date) and 'y' (quantity) columns
        """
        if not historical_data:
            raise ValueError("No historical data provided")
        
        # Convert to DataFrame
        df = pd.DataFrame(historical_data)
        df['ds'] = pd.to_datetime(df['month'] + '-01')
        df = df.rename(columns={'quantity': 'y'})
        df = df[['ds', 'y']].sort_values('ds')
        
        if fill_gaps:
            # Fill missing months with 0 (important for intermittent demand)
            date_range = pd.date_range(
                start=df['ds'].min(),
                end=df['ds'].max(),
                freq='MS'  # Month start
            )
            complete_df = pd.DataFrame({'ds': date_range})
            df = complete_df.merge(df, on='ds', how='left')
            df['y'] = df['y'].fillna(0)
        
        return df
    
    def detect_strategy(self, df: pd.DataFrame) -> Tuple[str, str, Dict]:
        """
        Detect best forecasting strategy based on data characteristics
        
        Returns:
            (strategy, reason, stats)
        """
        values = df['y'].values
        n_months = len(values)
        non_zero_count = np.sum(values > 0)
        non_zero_pct = (non_zero_count / n_months) * 100
        
        mean_usage = np.mean(values)
        std_usage = np.std(values)
        cv = std_usage / mean_usage if mean_usage > 0 else float('inf')  # Coefficient of Variation
        
        # Check for trend
        if n_months >= 12:
            recent_mean = np.mean(values[-12:])
            old_mean = np.mean(values[:12])
            trend_strength = abs(recent_mean - old_mean) / (old_mean + 1e-6)
        else:
            trend_strength = 0
        
        stats = {
            'n_months': n_months,
            'non_zero_count': int(non_zero_count),
            'non_zero_percentage': round(non_zero_pct, 1),
            'mean_usage': round(mean_usage, 2),
            'std_usage': round(std_usage, 2),
            'cv': round(cv, 2),
            'trend_strength': round(trend_strength, 3)
        }
        
        # Strategy decision
        if non_zero_pct >= 50 and cv < 1.0:
            strategy = 'time-series'
            reason = 'Utilisation régulière avec variabilité faible. Prévision par séries temporelles (Prophet/ARIMA).'
        elif non_zero_pct >= 20 and non_zero_pct < 50:
            strategy = 'statistical'
            reason = 'Utilisation modérée/intermittente. Prévision par moyennes mobiles et tendances.'
        else:
            strategy = 'safety-stock'
            reason = 'Utilisation sporadique (<20% des mois). Recommandation: stock de sécurité basé sur le risque.'
        
        return strategy, reason, stats
    
    def train_prophet(
        self,
        df: pd.DataFrame,
        horizon: int = 12,
        changepoint_prior_scale: float = 0.05,
        seasonality_mode: str = 'additive',
        growth: str = 'linear',
        yearly_seasonality: bool = True,
        monthly_seasonality: bool = False
    ) -> Dict:
        """
        Train Prophet model for time series forecasting
        
        Args:
            df: DataFrame with 'ds' and 'y' columns
            horizon: Number of months to forecast
            changepoint_prior_scale: Flexibility of trend (0.001-0.5)
            seasonality_mode: 'additive' or 'multiplicative'
            growth: 'linear' or 'logistic'
            
        Returns:
            Dictionary with forecasts and metrics
        """
        if not PROPHET_AVAILABLE:
            raise ImportError("Prophet not installed. Run: pip install prophet")
        
        # Train/test split (80/20)
        train_size = int(len(df) * 0.8)
        train_df = df[:train_size].copy()
        test_df = df[train_size:].copy()
        
        # Validation: minimum 3 months required (reduced from 6)
        if len(train_df) < 3:
            raise ValueError(f"Pas assez de données pour entraîner Prophet (minimum 3 mois, trouvé {len(df)} mois)")
        
        # Train Prophet model
        model = Prophet(
            changepoint_prior_scale=changepoint_prior_scale,
            seasonality_mode=seasonality_mode,
            growth=growth,
            yearly_seasonality=yearly_seasonality if len(train_df) >= 12 else False,
            weekly_seasonality=False,
            daily_seasonality=False
        )
        
        if monthly_seasonality and len(train_df) >= 24:
            model.add_seasonality(name='monthly', period=30.5, fourier_order=5)
        
        model.fit(train_df)
        self.model = model
        self.model_type = 'prophet'
        
        # Calculate metrics on test set
        if len(test_df) > 0:
            test_forecast = model.predict(test_df)
            y_true = test_df['y'].values
            y_pred = test_forecast['yhat'].values
            
            # Clip negative predictions to 0
            y_pred = np.maximum(y_pred, 0)
            
            metrics = self._calculate_metrics(y_true, y_pred)
        else:
            metrics = {'mae': 0, 'mape': 0, 'rmse': 0, 'r2': 0}
        
        # Generate future forecasts
        last_date = df['ds'].max()
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=horizon,
            freq='MS'
        )
        future_df = pd.DataFrame({'ds': future_dates})
        forecast = model.predict(future_df)
        
        # Prepare forecast results
        forecasts = []
        for idx, row in forecast.iterrows():
            forecasts.append({
                'month': row['ds'].strftime('%Y-%m'),
                'forecast': max(0, round(row['yhat'], 2)),
                'lower': max(0, round(row['yhat_lower'], 2)),
                'upper': max(0, round(row['yhat_upper'], 2))
            })
        
        # Historical data with fitted values
        historical_fit = model.predict(df)
        historical = []
        for idx, row in df.iterrows():
            hist_forecast = historical_fit.iloc[idx]
            historical.append({
                'month': row['ds'].strftime('%Y-%m'),
                'actual': float(row['y']),
                'fitted': max(0, round(hist_forecast['yhat'], 2))
            })
        
        return {
            'model': 'prophet',
            'forecasts': forecasts,
            'historical': historical,
            'metrics': metrics,
            'params': {
                'changepoint_prior_scale': changepoint_prior_scale,
                'seasonality_mode': seasonality_mode,
                'growth': growth
            }
        }
    
    def train_arima(
        self,
        df: pd.DataFrame,
        horizon: int = 12,
        order: Tuple[int, int, int] = (1, 1, 1),
        seasonal: bool = False,
        seasonal_order: Tuple[int, int, int, int] = (1, 1, 1, 12)
    ) -> Dict:
        """
        Train ARIMA/SARIMA model
        
        Args:
            df: DataFrame with 'ds' and 'y' columns
            horizon: Number of months to forecast
            order: (p, d, q) for ARIMA
            seasonal: Whether to use SARIMA
            seasonal_order: (P, D, Q, s) for seasonal component
            
        Returns:
            Dictionary with forecasts and metrics
        """
        if not STATSMODELS_AVAILABLE:
            raise ImportError("statsmodels not installed. Run: pip install statsmodels")
        
        # Minimum data check
        if len(df) < 6:
            raise ValueError(f"ARIMA requires at least 6 months of data, found {len(df)}")
        
        # Train/test split
        train_size = int(len(df) * 0.8)
        train_data = df['y'][:train_size]
        test_data = df['y'][train_size:]
        
        try:
            # Train model
            if seasonal and len(train_data) >= 24:
                model = SARIMAX(
                    train_data,
                    order=order,
                    seasonal_order=seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False
                )
            else:
                model = ARIMA(train_data, order=order)
            
            fitted_model = model.fit()
            self.model = fitted_model
            self.model_type = 'sarima' if seasonal else 'arima'
        except Exception as e:
            # Fallback to simpler order if fitting fails
            print(f"ARIMA fitting failed with {order}, trying (1,1,1): {e}")
            model = ARIMA(train_data, order=(1, 1, 1))
            fitted_model = model.fit()
            self.model = fitted_model
            self.model_type = 'arima'
        
        # Calculate metrics on test set
        if len(test_data) > 0:
            test_forecast = fitted_model.forecast(steps=len(test_data))
            y_true = test_data.values
            y_pred = np.maximum(test_forecast.values, 0)
            
            metrics = self._calculate_metrics(y_true, y_pred)
        else:
            metrics = {'mae': 0, 'mape': 0, 'rmse': 0, 'r2': 0}
        
        # Generate future forecasts
        forecast = fitted_model.forecast(steps=horizon)
        forecast_values = np.maximum(forecast.values, 0)
        
        # Confidence intervals (approximation)
        std_err = np.std(fitted_model.resid)
        confidence_interval = 1.96 * std_err
        
        last_date = df['ds'].max()
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=horizon,
            freq='MS'
        )
        
        forecasts = []
        for i, date in enumerate(future_dates):
            pred = forecast_values[i]
            forecasts.append({
                'month': date.strftime('%Y-%m'),
                'forecast': round(pred, 2),
                'lower': max(0, round(pred - confidence_interval, 2)),
                'upper': round(pred + confidence_interval, 2)
            })
        
        # Historical fitted values
        fitted_values = fitted_model.fittedvalues
        historical = []
        for idx, row in df.iterrows():
            fitted_val = fitted_values.iloc[idx] if idx < len(fitted_values) else row['y']
            historical.append({
                'month': row['ds'].strftime('%Y-%m'),
                'actual': float(row['y']),
                'fitted': max(0, round(fitted_val, 2))
            })
        
        return {
            'model': 'arima' if not seasonal else 'sarima',
            'forecasts': forecasts,
            'historical': historical,
            'metrics': metrics,
            'params': {
                'order': order,
                'seasonal_order': seasonal_order if seasonal else None
            }
        }
    
    def train_lstm(
        self,
        df: pd.DataFrame,
        horizon: int = 12,
        lookback: int = 12,
        units: int = 64,
        layers: int = 2,
        dropout: float = 0.2,
        epochs: int = 100
    ) -> Dict:
        """
        Train LSTM model for time series forecasting
        
        Args:
            df: DataFrame with 'ds' and 'y' columns
            horizon: Number of months to forecast
            lookback: Number of past months to use as input
            units: LSTM units per layer
            layers: Number of LSTM layers
            dropout: Dropout rate
            epochs: Training epochs
            
        Returns:
            Dictionary with forecasts and metrics
        """
        if not TENSORFLOW_AVAILABLE:
            raise ImportError("TensorFlow not installed. Run: pip install tensorflow")
        
        values = df['y'].values.reshape(-1, 1)
        
        # Normalize data
        scaler = MinMaxScaler()
        scaled_data = scaler.fit_transform(values)
        self.scaler = scaler
        
        # Create sequences
        X, y = [], []
        for i in range(lookback, len(scaled_data)):
            X.append(scaled_data[i-lookback:i, 0])
            y.append(scaled_data[i, 0])
        
        X, y = np.array(X), np.array(y)
        X = X.reshape(X.shape[0], X.shape[1], 1)
        
        if len(X) < 10:
            raise ValueError(f"Not enough data for LSTM. Need at least {lookback + 10} months")
        
        # Train/test split
        train_size = int(len(X) * 0.8)
        X_train, X_test = X[:train_size], X[train_size:]
        y_train, y_test = y[:train_size], y[train_size:]
        
        # Build LSTM model (optimized for sparse time series)
        model = keras.Sequential()
        
        # First LSTM layer
        model.add(keras.layers.LSTM(
            units=units,
            return_sequences=(layers > 1),
            input_shape=(lookback, 1)
        ))
        model.add(keras.layers.Dropout(dropout))
        
        # Additional LSTM layers
        for i in range(1, layers):
            return_sequences = (i < layers - 1)
            model.add(keras.layers.LSTM(
                units=units // (2 ** i),  # Decreasing units
                return_sequences=return_sequences
            ))
            model.add(keras.layers.Dropout(dropout))
        
        # Dense layers for better feature extraction
        model.add(keras.layers.Dense(32, activation='relu'))
        model.add(keras.layers.Dropout(dropout / 2))
        model.add(keras.layers.Dense(1))
        
        # Use MAE loss for sparse data (more robust to outliers)
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='mae',
            metrics=['mse']
        )
        
        # Train model with early stopping
        early_stop = keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=15,
            restore_best_weights=True
        )
        
        # Adjust batch size for small datasets
        batch_size = min(16, len(X_train) // 4) if len(X_train) < 64 else 16
        
        model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.15 if len(X_train) >= 20 else 0.0,
            callbacks=[early_stop] if len(X_train) >= 20 else [],
            verbose=0
        )
        
        self.model = model
        self.model_type = 'lstm'
        
        # Calculate metrics on test set
        if len(X_test) > 0:
            y_pred_scaled = model.predict(X_test, verbose=0)
            y_pred = scaler.inverse_transform(y_pred_scaled).flatten()
            y_true = scaler.inverse_transform(y_test.reshape(-1, 1)).flatten()
            
            metrics = self._calculate_metrics(y_true, y_pred)
        else:
            metrics = {'mae': 0, 'mape': 0, 'rmse': 0, 'r2': 0}
        
        # Generate future forecasts
        last_sequence = scaled_data[-lookback:].reshape(1, lookback, 1)
        forecasts_scaled = []
        
        for _ in range(horizon):
            pred = model.predict(last_sequence, verbose=0)
            forecasts_scaled.append(pred[0, 0])
            # Update sequence with prediction
            last_sequence = np.append(last_sequence[:, 1:, :], pred.reshape(1, 1, 1), axis=1)
        
        forecasts_scaled = np.array(forecasts_scaled).reshape(-1, 1)
        forecast_values = scaler.inverse_transform(forecasts_scaled).flatten()
        forecast_values = np.maximum(forecast_values, 0)
        
        # Uncertainty estimation (using prediction variance)
        std_err = np.std(y_true - y_pred) if len(y_test) > 0 else np.std(values)
        
        last_date = df['ds'].max()
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=horizon,
            freq='MS'
        )
        
        forecasts = []
        for i, date in enumerate(future_dates):
            pred = forecast_values[i]
            forecasts.append({
                'month': date.strftime('%Y-%m'),
                'forecast': round(pred, 2),
                'lower': max(0, round(pred - 1.96 * std_err, 2)),
                'upper': round(pred + 1.96 * std_err, 2)
            })
        
        # Historical fitted values
        fitted_scaled = model.predict(X, verbose=0)
        fitted_values = scaler.inverse_transform(fitted_scaled).flatten()
        
        historical = []
        for idx, row in df.iterrows():
            if idx >= lookback:
                fitted_val = fitted_values[idx - lookback]
            else:
                fitted_val = row['y']
            
            historical.append({
                'month': row['ds'].strftime('%Y-%m'),
                'actual': float(row['y']),
                'fitted': max(0, round(fitted_val, 2))
            })
        
        return {
            'model': 'lstm',
            'forecasts': forecasts,
            'historical': historical,
            'metrics': metrics,
            'params': {
                'lookback': lookback,
                'units': units,
                'layers': layers,
                'dropout': dropout,
                'epochs': epochs
            }
        }
    
    def _calculate_metrics(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict:
        """Calculate forecasting metrics"""
        # MAE: Mean Absolute Error
        mae = np.mean(np.abs(y_true - y_pred))
        
        # MAPE: Mean Absolute Percentage Error (only for non-zero actuals)
        non_zero_mask = y_true > 0
        if np.any(non_zero_mask):
            mape = np.mean(np.abs((y_true[non_zero_mask] - y_pred[non_zero_mask]) / y_true[non_zero_mask])) * 100
        else:
            mape = 0
        
        # RMSE: Root Mean Squared Error
        rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
        
        # R²: Coefficient of Determination
        ss_res = np.sum((y_true - y_pred) ** 2)
        ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        r2 = max(0, min(1, r2))  # Clip between 0 and 1
        
        return {
            'mae': round(mae, 2),
            'mape': round(mape, 1),
            'rmse': round(rmse, 2),
            'r2': round(r2, 3)
        }


def forecast_pdr(
    historical_data: List[Dict],
    model_type: Literal['prophet', 'arima', 'sarima', 'lstm'],
    horizon: int = 12,
    params: Optional[Dict] = None,
    use_mtbf: bool = True,
    safety_factor: float = 1.0
) -> Dict:
    """
    Main entry point for PDR forecasting with MTBF enhancement
    
    Args:
        historical_data: List of {month: 'YYYY-MM', quantity: int}
        model_type: 'prophet', 'arima', 'sarima', or 'lstm'
        horizon: Number of months to forecast
        params: Model-specific parameters
        use_mtbf: Whether to blend MTBF-based forecast (if available)
        safety_factor: Multiplier for conservative forecasting (e.g., 1.2 for 24/7 assumption)
        
    Returns:
        Dictionary with forecasts, metrics, and strategy
    """
    if not historical_data:
        raise ValueError("No historical data provided")
    
    forecaster = PDRForecaster()
    df = forecaster.prepare_data(historical_data)
    
    # Calculate MTBF if possible
    mtbf_stats = forecaster.calculate_mtbf(historical_data) if use_mtbf else None
    
    # Detect optimal strategy
    strategy, strategy_reason, usage_stats = forecaster.detect_strategy(df)
    
    # Default parameters
    params = params or {}
    
    try:
        if model_type == 'prophet':
            result = forecaster.train_prophet(
                df,
                horizon=horizon,
                changepoint_prior_scale=params.get('changepoint_prior_scale', 0.05),
                seasonality_mode=params.get('seasonality_mode', 'additive'),
                growth=params.get('growth', 'linear')
            )
        elif model_type == 'arima':
            result = forecaster.train_arima(
                df,
                horizon=horizon,
                order=tuple(params.get('order', [1, 1, 1])),
                seasonal=False
            )
        elif model_type == 'sarima':
            result = forecaster.train_arima(
                df,
                horizon=horizon,
                order=tuple(params.get('order', [1, 1, 1])),
                seasonal=True,
                seasonal_order=tuple(params.get('seasonal_order', [1, 1, 1, 12]))
            )
        elif model_type == 'lstm':
            result = forecaster.train_lstm(
                df,
                horizon=horizon,
                lookback=params.get('lookback', min(12, len(df) // 2)),
                units=params.get('units', 64),
                layers=params.get('layers', 2),
                dropout=params.get('dropout', 0.2),
                epochs=params.get('epochs', 100)
            )
        else:
            raise ValueError(f"Unknown model type: {model_type}")
        
        # Add strategy information
        result['strategy'] = strategy
        result['strategy_reason'] = strategy_reason
        result['usage_stats'] = usage_stats
        result['trained_at'] = datetime.now().isoformat()
        
        # MTBF Enhancement: Blend with reliability-based forecast if available
        if mtbf_stats and mtbf_stats['n_failures'] >= 3:
            mtbf_forecast_result = forecaster.mtbf_forecast(mtbf_stats, horizon)
            
            # Blend forecasts: more weight to MTBF if high confidence
            mtbf_weight = 0.7 if mtbf_stats['n_failures'] >= 5 else 0.5
            ts_weight = 1.0 - mtbf_weight
            
            # Apply blending to each forecast point
            for i, forecast_point in enumerate(result['forecasts']):
                if i < len(mtbf_forecast_result['forecasts']):
                    mtbf_pred = mtbf_forecast_result['forecasts'][i]['expected_failures']
                    ts_pred = forecast_point['forecast']
                    
                    # Blended prediction
                    blended = mtbf_weight * mtbf_pred + ts_weight * ts_pred
                    
                    # Apply safety factor for conservative forecasting
                    blended *= safety_factor
                    
                    forecast_point['forecast'] = round(blended, 1)
                    forecast_point['mtbf_component'] = round(mtbf_pred, 2)
                    forecast_point['ts_component'] = round(ts_pred, 2)
                    
                    # Update confidence bounds with safety factor
                    if 'lower' in forecast_point:
                        forecast_point['lower'] = round(forecast_point['lower'] * safety_factor, 1)
                    if 'upper' in forecast_point:
                        forecast_point['upper'] = round(forecast_point['upper'] * safety_factor, 1)
            
            # Add MTBF metadata
            result['mtbf_stats'] = mtbf_stats
            result['mtbf_weight'] = mtbf_weight
            result['safety_factor'] = safety_factor
            result['forecasting_method'] = f'hybrid_mtbf_{model_type}'
            
            # Enhanced explanation
            result['strategy_reason'] = (
                f"{strategy_reason} "
                f"Prévision améliorée avec MTBF ({mtbf_stats['mtbf_months']:.1f} mois entre pannes, "
                f"{mtbf_stats['n_failures']} pannes historiques). "
                f"Pondération: {int(mtbf_weight*100)}% fiabilité / {int(ts_weight*100)}% tendance. "
                f"Facteur de sécurité: {safety_factor}x."
            )
        else:
            # Pure time-series, apply safety factor only
            if safety_factor != 1.0:
                for forecast_point in result['forecasts']:
                    forecast_point['forecast'] = round(forecast_point['forecast'] * safety_factor, 1)
                    if 'lower' in forecast_point:
                        forecast_point['lower'] = round(forecast_point['lower'] * safety_factor, 1)
                    if 'upper' in forecast_point:
                        forecast_point['upper'] = round(forecast_point['upper'] * safety_factor, 1)
                
                result['safety_factor'] = safety_factor
                result['forecasting_method'] = f'{model_type}_with_safety_factor'
                result['strategy_reason'] += f" Facteur de sécurité appliqué: {safety_factor}x (hypothèse: utilisation intensive 24/7)."
            else:
                result['forecasting_method'] = model_type
            
            # Warn if MTBF unavailable
            if use_mtbf and not mtbf_stats:
                result['warning'] = "MTBF non calculable (moins de 2 pannes historiques). Prévision basée uniquement sur les tendances temporelles."
            elif use_mtbf and mtbf_stats['n_failures'] < 3:
                result['warning'] = f"MTBF disponible mais peu fiable ({mtbf_stats['n_failures']} pannes). Prévision basée principalement sur les tendances."
        
        return result
        
    except Exception as e:
        raise Exception(f"Error training {model_type} model: {str(e)}")
