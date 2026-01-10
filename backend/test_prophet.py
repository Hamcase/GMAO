"""
Test script for Prophet forecasting
"""
from scripts.forecast_pdr import forecast_pdr

# Sample data: 12 months of spare part usage
historical_data = [
    {'month': '2024-01', 'quantity': 2},
    {'month': '2024-02', 'quantity': 0},
    {'month': '2024-03', 'quantity': 5},
    {'month': '2024-04', 'quantity': 0},
    {'month': '2024-05', 'quantity': 1},
    {'month': '2024-06', 'quantity': 0},
    {'month': '2024-07', 'quantity': 8},  # Summer peak
    {'month': '2024-08', 'quantity': 0},
    {'month': '2024-09', 'quantity': 1},
    {'month': '2024-10', 'quantity': 0},
    {'month': '2024-11', 'quantity': 0},
    {'month': '2024-12', 'quantity': 2},
]

print("🔬 Testing Prophet forecasting...")
print(f"📊 Input data: {len(historical_data)} months")

try:
    result = forecast_pdr(
        historical_data=historical_data,
        model_type='prophet',
        horizon=12,
        params={'changepoint_prior_scale': 0.05}
    )
    
    print("\n✅ Prophet model trained successfully!")
    print(f"📈 Model: {result['model'].upper()}")
    print(f"📊 Strategy: {result['strategy']}")
    print(f"💡 Reason: {result['strategy_reason']}")
    
    print("\n📊 Metrics:")
    print(f"  MAE:  {result['metrics']['mae']}")
    print(f"  MAPE: {result['metrics']['mape']}%")
    print(f"  RMSE: {result['metrics']['rmse']}")
    print(f"  R²:   {result['metrics']['r2']}")
    
    print("\n📅 First 3 forecasts:")
    for i, forecast in enumerate(result['forecasts'][:3]):
        print(f"  {forecast['month']}: {forecast['forecast']:.2f} pièces [{forecast['lower']:.2f} - {forecast['upper']:.2f}]")
    
    print("\n🎯 Test PASSED - Real ML model is working!")
    
except Exception as e:
    print(f"\n❌ Test FAILED: {e}")
    import traceback
    traceback.print_exc()
