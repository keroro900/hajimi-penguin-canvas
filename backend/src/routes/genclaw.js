const express = require('express');
const { renderSketchToFiles } = require('../utils/genclawSketch');

const router = express.Router();

router.post('/render', async (req, res) => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code.trim()) {
      return res.status(400).json({ success: false, error: '缺少草图代码' });
    }
    const data = await renderSketchToFiles({
      code,
      kind: req.body?.kind,
      width: req.body?.width,
      height: req.body?.height,
      title: req.body?.title,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error?.message || '草图渲染失败' });
  }
});

module.exports = router;

