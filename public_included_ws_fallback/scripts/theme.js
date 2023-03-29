(function(){

  const prefersDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersLightTheme = window.matchMedia('(prefers-color-scheme: light)').matches;

  const $themeAuto = document.getElementById('theme-auto');
  const $themeLight = document.getElementById('theme-light');
  const $themeDark = document.getElementById('theme-dark');

  let currentTheme = localStorage.getItem('theme');

  if (currentTheme === 'dark') {
    setModeToDark();
  } else if (currentTheme === 'light') {
    setModeToLight();
  }

  $themeAuto.addEventListener('click', _ => {
    if (currentTheme) {
      setModeToAuto();
    } else {
      setModeToDark();
    }
  });
  $themeLight.addEventListener('click', _ => {
    if (currentTheme !== 'light') {
      setModeToLight();
    } else {
      setModeToAuto();
    }
  });
  $themeDark.addEventListener('click', _ => {
    if (currentTheme !== 'dark') {
      setModeToDark();
    } else {
      setModeToLight();
    }
  });

  function setModeToDark() {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    currentTheme = 'dark';

    $themeAuto.classList.remove("selected");
    $themeLight.classList.remove("selected");
    $themeDark.classList.add("selected");
  }

  function setModeToLight() {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
    currentTheme = 'light';

    $themeAuto.classList.remove("selected");
    $themeLight.classList.add("selected");
    $themeDark.classList.remove("selected");
  }

  function setModeToAuto() {
    document.body.classList.remove('dark-theme');
    document.body.classList.remove('light-theme');
    if (prefersDarkTheme) {
      document.body.classList.add('dark-theme');
    } else if (prefersLightTheme) {
      document.body.classList.add('light-theme');
    }
    localStorage.removeItem('theme');
    currentTheme = undefined;

    $themeAuto.classList.add("selected");
    $themeLight.classList.remove("selected");
    $themeDark.classList.remove("selected");
  }

})();
