/* não deixa o Xodó'S ser aberto escondido dentro de outro site */
if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location.href; } catch (e) {} }
(function () {
  var t = 'dark';
  try { t = localStorage.getItem('xodos-theme') || 'dark'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
})();
