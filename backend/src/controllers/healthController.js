function getHealth(_req, res) {
  res.json({
    status: 'ok',
    service: 'skyra-backend',
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealth,
};
