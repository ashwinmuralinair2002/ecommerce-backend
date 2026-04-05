(function () {
  function getLoader() {
    return document.getElementById('global-loader');
  }

  let isVisible = false;

  window.showLoader = function () {
    const loader = getLoader();
    if (loader && !isVisible) {
      loader.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      isVisible = true;
    }
  };

  window.hideLoader = function () {
    const loader = getLoader();
    if (loader && isVisible) {
      loader.classList.add('hidden');
      document.body.style.overflow = '';
      isVisible = false;
    }
  };
})();
