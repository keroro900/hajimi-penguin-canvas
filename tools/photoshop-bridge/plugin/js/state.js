(function () {
  const savedHost = localStorage.getItem('hakimi.ps.host') || localStorage.getItem('t8.ps.host') || '127.0.0.1:18766';
  window.T8PS = {
    state: {
      host: savedHost,
      connected: false,
      tab: 'assets',
      assetSections: [],
      activeSection: 'outputs',
      assets: [],
      selectedAssetId: '',
      providers: [],
      providerId: '',
      model: '',
      generateMode: 'generate',
      results: [],
      uploadLayer: (localStorage.getItem('hakimi.ps.uploadLayer') || localStorage.getItem('t8.ps.uploadLayer')) !== '0',
      commandTimer: null,
      commandBusy: false,
    },
  };
})();
