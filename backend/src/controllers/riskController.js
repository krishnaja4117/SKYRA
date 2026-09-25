const { validateRiskInput } = require('../utils/validateRiskInput');
const { calculateRisk } = require('../services/riskEngine');

async function postRisk(req, res, next) {
  try {
    const inputs = validateRiskInput(req.body);
    const result = await calculateRisk(inputs);

    res.json({
      ...result,
      inputs,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postRisk,
};