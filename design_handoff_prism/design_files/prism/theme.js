/* Prism — theme system. Three warm "reading instrument" identities.
 * Each is a complete set of CSS custom properties applied to <html>. */
(function () {
  const HL = {
    light: {
      yellow: '#f6e6a6', green: '#cfe2b2', blue: '#bcd6e8',
      pink: '#eecbd4', purple: '#dccfe6',
    },
    dark: {
      yellow: '#5b4a1e', green: '#37512c', blue: '#274a63', pink: '#5d2840', purple: '#432a5c',
    },
  };

  const THEMES = {
    parchment: {
      label: 'Parchment',
      kind: 'light',
      blurb: 'Warm sand, copper ink — bookish daylight reading.',
      swatch: ['#faf6ee', '#b06a2c', '#2c2620'],
      vars: {
        '--bg': '#e7ded0',
        '--surface': '#f1ebdf',
        '--surface-2': '#e9e1d2',
        '--paper': '#faf6ee',
        '--ink': '#2c2620',
        '--ink-2': '#5b5346',
        '--ink-3': '#938974',
        '--line': '#ddd2c0',
        '--line-soft': '#e7ddcc',
        '--accent': '#b06a2c',
        '--accent-2': '#955620',
        '--accent-soft': 'rgba(176,106,44,0.13)',
        '--accent-ink': '#faf6ee',
        '--scroll': '#cdc1ad',
        '--code-bg': '#f2ebdd',
        '--code-ink': '#4a4236',
        '--shadow': '0 1px 2px rgba(60,46,28,.05), 0 8px 24px -10px rgba(60,46,28,.18)',
        '--shadow-lg': '0 24px 64px -18px rgba(50,38,22,.34)',
        '--hl-yellow': HL.light.yellow, '--hl-green': HL.light.green,
        '--hl-blue': HL.light.blue, '--hl-pink': HL.light.pink, '--hl-purple': HL.light.purple,
        '--ok': '#5b8b4e', '--warn': '#b7791f', '--err': '#b4452f', '--info': '#3a7196',
        '--titlebar': '#e2d8c8',
      },
    },
    campfire: {
      label: 'Campfire',
      kind: 'dark',
      blurb: 'Espresso dark, ember glow — cozy night reading.',
      swatch: ['#241e19', '#e0883c', '#ece3d4'],
      vars: {
        '--bg': '#17130f',
        '--surface': '#201b16',
        '--surface-2': '#1a1511',
        '--paper': '#241e18',
        '--ink': '#ece2d2',
        '--ink-2': '#b6aa96',
        '--ink-3': '#7d7263',
        '--line': '#352e26',
        '--line-soft': '#2a241e',
        '--accent': '#e08a3c',
        '--accent-2': '#f0a052',
        '--accent-soft': 'rgba(224,138,60,0.16)',
        '--accent-ink': '#1a140e',
        '--scroll': '#3c342b',
        '--code-bg': '#1b1611',
        '--code-ink': '#cdbfa8',
        '--shadow': '0 1px 2px rgba(0,0,0,.3), 0 10px 30px -12px rgba(0,0,0,.6)',
        '--shadow-lg': '0 30px 70px -20px rgba(0,0,0,.7)',
        '--hl-yellow': HL.dark.yellow, '--hl-green': HL.dark.green,
        '--hl-blue': HL.dark.blue, '--hl-pink': HL.dark.pink, '--hl-purple': HL.dark.purple,
        '--ok': '#85b06a', '--warn': '#e0a040', '--err': '#e0715a', '--info': '#69a8cc',
        '--titlebar': '#1d1813',
      },
    },
    newsprint: {
      label: 'Newsprint',
      kind: 'light',
      blurb: 'High-contrast editorial — oxblood, rules & drop caps.',
      swatch: ['#f7f4ee', '#8c3a2b', '#221f1b'],
      vars: {
        '--bg': '#e4e0d7',
        '--surface': '#ede9e0',
        '--surface-2': '#e6e1d6',
        '--paper': '#f8f5ef',
        '--ink': '#211e19',
        '--ink-2': '#4c473e',
        '--ink-3': '#857d6f',
        '--line': '#d6cfbf',
        '--line-soft': '#e2daccb',
        '--accent': '#8c3a2b',
        '--accent-2': '#742f22',
        '--accent-soft': 'rgba(140,58,43,0.10)',
        '--accent-ink': '#f8f5ef',
        '--scroll': '#cabfa9',
        '--code-bg': '#efebe1',
        '--code-ink': '#433d33',
        '--shadow': '0 1px 2px rgba(40,30,18,.06), 0 8px 22px -10px rgba(40,30,18,.2)',
        '--shadow-lg': '0 24px 64px -18px rgba(40,30,18,.36)',
        '--hl-yellow': HL.light.yellow, '--hl-green': HL.light.green,
        '--hl-blue': HL.light.blue, '--hl-pink': HL.light.pink, '--hl-purple': HL.light.purple,
        '--ok': '#4f7a45', '--warn': '#9c6a14', '--err': '#8c3a2b', '--info': '#356085',
        '--titlebar': '#ddd7cb',
      },
    },
  };

  function applyTheme(id) {
    const t = THEMES[id] || THEMES.parchment;
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-identity', id);
    root.setAttribute('data-kind', t.kind);
    if (!window.PRISM_NO_PERSIST) { try { localStorage.setItem('prism.theme', id); } catch (e) {} }
  }

  // Spectrum used for the prism motif (progress bar, graph clusters).
  const SPECTRUM = ['#c2532f', '#cf7a2a', '#c9a52a', '#5b8b4e', '#3a7196', '#6a5aa0'];

  window.PRISM_THEMES = THEMES;
  window.applyPrismTheme = applyTheme;
  window.PRISM_SPECTRUM = SPECTRUM;
})();
