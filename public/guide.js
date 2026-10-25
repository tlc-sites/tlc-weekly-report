// NEW 표시는 적힌 날짜(한국 시간)부터 30일 동안만 보인다.
(function () {
  var now = Date.now();
  document.querySelectorAll('.new[data-new]').forEach(function (el) {
    var t = Date.parse(el.getAttribute('data-new') + 'T00:00:00+09:00');
    if (!isNaN(t) && now - t > 30 * 86400000) el.classList.add('old');
  });
})();
