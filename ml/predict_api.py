from flask import Flask, request, jsonify
import joblib

app = Flask(__name__)

model = joblib.load("risk_model.pkl")


@app.route("/predict", methods=["POST"])
def predict():
    data = request.json

    # Input features for the trained ML model
    features = [[
        data["rainfall"],
        data["forecastRainfall"],
        data["humidity"],
        data["windSpeed"],
        data["historicalRisk"],
        data["terrainSlope"],
        data["temperature"],
        data["pressure"]
    ]]

    # ML prediction
    prediction = model.predict(features)[0]

    probabilities = model.predict_proba(features)[0]
    classes = model.classes_

    predicted_index = list(classes).index(prediction)

    confidence = round(
        probabilities[predicted_index] * 100
    )

    # Convert ML probabilities into a weighted risk score
    risk_weights = {
        "Low": 20,
        "Moderate": 45,
        "High": 70,
        "Severe": 95
    }

    risk_score = 0

    for class_name, probability in zip(classes, probabilities):
        risk_score += risk_weights.get(
            class_name,
            50
        ) * probability

    risk_score = round(risk_score)

    # -------------------------------------------------
    # SKYRA EXPLAINABLE RISK FACTORS
    # -------------------------------------------------

    factors = []

    rainfall = float(data["rainfall"])
    forecast_rainfall = float(data["forecastRainfall"])
    humidity = float(data["humidity"])
    wind_speed = float(data["windSpeed"])
    historical_risk = float(data["historicalRisk"])
    terrain_slope = float(data["terrainSlope"])
    temperature = float(data["temperature"])
    pressure = float(data["pressure"])

    # Rainfall factor
    if rainfall >= 50:
        factors.append({
            "name": "Heavy recent rainfall",
            "impact": "High",
            "detail": f"{rainfall} mm of recent rainfall detected."
        })
    elif rainfall >= 10:
        factors.append({
            "name": "Recent rainfall",
            "impact": "Moderate",
            "detail": f"{rainfall} mm of recent rainfall detected."
        })
    else:
        factors.append({
            "name": "Low recent rainfall",
            "impact": "Low",
            "detail": f"Only {rainfall} mm of recent rainfall detected."
        })

    # Forecast rainfall
    if forecast_rainfall >= 50:
        factors.append({
            "name": "Heavy forecast rainfall",
            "impact": "High",
            "detail": f"{forecast_rainfall} mm rainfall is expected."
        })
    elif forecast_rainfall >= 20:
        factors.append({
            "name": "Forecast rainfall",
            "impact": "Moderate",
            "detail": f"{forecast_rainfall} mm rainfall is forecast."
        })
    else:
        factors.append({
            "name": "Low forecast rainfall",
            "impact": "Low",
            "detail": f"{forecast_rainfall} mm rainfall is forecast."
        })

    # Humidity
    if humidity >= 85:
        factors.append({
            "name": "High humidity",
            "impact": "Moderate",
            "detail": f"Humidity is {humidity}%."
        })

    # Wind
    if wind_speed >= 50:
        factors.append({
            "name": "Strong wind",
            "impact": "High",
            "detail": f"Wind speed is {wind_speed} km/h."
        })
    elif wind_speed >= 30:
        factors.append({
            "name": "Elevated wind speed",
            "impact": "Moderate",
            "detail": f"Wind speed is {wind_speed} km/h."
        })

    # Historical risk
    if historical_risk >= 70:
        factors.append({
            "name": "High historical risk",
            "impact": "High",
            "detail": f"Historical risk index is {historical_risk}."
        })
    elif historical_risk >= 40:
        factors.append({
            "name": "Historical risk pattern",
            "impact": "Moderate",
            "detail": f"Historical risk index is {historical_risk}."
        })

    # Terrain
    if terrain_slope >= 30:
        factors.append({
            "name": "Steep terrain",
            "impact": "High",
            "detail": f"Terrain slope is {terrain_slope}°."
        })
    elif terrain_slope >= 10:
        factors.append({
            "name": "Moderate terrain slope",
            "impact": "Moderate",
            "detail": f"Terrain slope is {terrain_slope}°."
        })

    # Pressure
    if pressure < 1000:
        factors.append({
            "name": "Low atmospheric pressure",
            "impact": "Moderate",
            "detail": f"Surface pressure is {pressure} hPa."
        })

    # Temperature
    if temperature >= 38:
        factors.append({
            "name": "High temperature",
            "impact": "Moderate",
            "detail": f"Temperature is {temperature}°C."
        })

    # Make sure the dashboard always has something to display
    if not factors:
        factors.append({
            "name": "Stable weather conditions",
            "impact": "Low",
            "detail": "No major individual weather risk factor detected."
        })

    # -------------------------------------------------
    # SKYRA RISK EXPLANATION
    # -------------------------------------------------

    explanation = (
        f"SKYRA ML model classified the current conditions as "
        f"{prediction} risk with a risk score of {risk_score}% "
        f"and model confidence of {confidence}%."
    )

    return jsonify({
        "riskLevel": prediction,
        "riskScore": risk_score,
        "confidence": confidence,
        "explanation": explanation,
        "factors": factors
    })


if __name__ == "__main__":
    app.run(port=8000)