#!/usr/bin/env python3
"""Test script for PDR forecasting models"""

from scripts.forecast_pdr import forecast_pdr
import json

# Test data: 24 months of increasing usage (sufficient for all models including LSTM)
test_data = [
    {'month': f'{2023 + i//12}-{(i%12)+1:02d}', 'quantity': i * 2 + 5 + (i % 3)}
    for i in range(24)
]

print("=" * 60)
print("TESTING PDR FORECASTING MODELS")
print("=" * 60)

models = ['prophet', 'arima', 'sarima', 'lstm']

for model in models:
    print(f"\n{'='*60}")
    print(f"Testing {model.upper()}...")
    print(f"{'='*60}")
    
    try:
        result = forecast_pdr(
            historical_data=test_data,
            model_type=model,
            horizon=3,
            use_mtbf=False,  # Disable MTBF for simple test
            safety_factor=1.0
        )
        
        print(f"✅ {model.upper()} SUCCESS!")
        print(f"   Metrics: MAE={result['metrics']['mae']:.2f}, MAPE={result['metrics']['mape']:.1f}%")
        print(f"   Strategy: {result['strategy']} - {result['strategy_reason']}")
        print(f"   Forecasts:")
        for fc in result['forecasts']:
            print(f"      {fc['month']}: {fc['forecast']:.1f} (confidence: {fc['lower']:.1f} - {fc['upper']:.1f})")
        
    except Exception as e:
        print(f"❌ {model.upper()} FAILED!")
        print(f"   Error: {str(e)}")
        import traceback
        traceback.print_exc()

print(f"\n{'='*60}")
print("TEST COMPLETE")
print(f"{'='*60}")
