from sklearn.ensemble import RandomForestClassifier
import joblib

# SKYRA ML Training Data
#
# Features:
# [rainfall,
#  forecast_rainfall,
#  humidity,
#  wind_speed,
#  historical_risk,
#  terrain_slope,
#  temperature,
#  pressure]

X = [
    [2, 5, 60, 10, 10, 2, 30, 1015],
    [5, 10, 65, 15, 15, 3, 30, 1013],
    [10, 20, 70, 20, 25, 5, 29, 1010],
    [15, 30, 75, 25, 30, 8, 28, 1008],
    [25, 40, 80, 35, 45, 10, 27, 1005],
    [35, 50, 85, 45, 60, 12, 26, 1002],
    [45, 60, 90, 55, 70, 15, 25, 999],
    [55, 70, 95, 65, 85, 20, 24, 996],
    [70, 90, 98, 80, 95, 25, 23, 992],

    [3, 8, 62, 12, 12, 4, 31, 1014],
    [8, 15, 68, 18, 20, 6, 29, 1011],
    [18, 35, 76, 28, 35, 9, 28, 1007],
    [28, 45, 82, 38, 50, 11, 27, 1004],
    [40, 55, 88, 48, 65, 14, 26, 1001],
    [50, 65, 92, 58, 78, 18, 25, 998],
    [65, 85, 96, 72, 90, 22, 24, 994],
    [80, 100, 99, 90, 98, 30, 22, 990],

    [4, 6, 58, 9, 8, 2, 32, 1016],
    [12, 18, 72, 22, 28, 7, 29, 1009],
    [22, 35, 78, 30, 40, 9, 28, 1006],
    [32, 48, 84, 42, 55, 13, 27, 1003],
    [48, 62, 91, 52, 72, 17, 25, 998],
    [60, 78, 94, 68, 88, 21, 24, 995],
    [75, 95, 98, 85, 96, 27, 22, 991],
]

# Risk labels
y = [
    "Low",
    "Low",
    "Moderate",
    "Moderate",
    "High",
    "High",
    "Severe",
    "Severe",
    "Severe",

    "Low",
    "Low",
    "Moderate",
    "High",
    "High",
    "Severe",
    "Severe",
    "Severe",

    "Low",
    "Moderate",
    "Moderate",
    "High",
    "High",
    "Severe",
    "Severe",
]

# Create Random Forest model
model = RandomForestClassifier(
    n_estimators=200,
    max_depth=8,
    random_state=42,
    class_weight="balanced"
)

# Train model
model.fit(X, y)

# Save model
joblib.dump(model, "risk_model.pkl")

print("SKYRA ML model trained successfully!")
print("Model: Random Forest")
print("Features: 8")
print("Trees: 200")
print("Model saved as risk_model.pkl")