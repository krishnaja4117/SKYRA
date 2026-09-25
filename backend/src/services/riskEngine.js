async function calculateRisk(inputs) {
  const response = await fetch("http://127.0.0.1:8000/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(inputs)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("ML failed: " + text);
  }

  return await response.json();
}

module.exports = {
  calculateRisk
};