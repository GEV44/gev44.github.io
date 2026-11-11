(function(){
  var d=document.documentElement,b=document.getElementById('theme');
  function cur(){var t=d.getAttribute('data-theme');if(t)return t;return window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'}
  try{var s=localStorage.getItem('theme');if(s)d.setAttribute('data-theme',s)}catch(e){}
  function lab(){b.textContent=cur()==='dark'?'светлая':'тёмная'}
  lab();
  b.addEventListener('click',function(){var n=cur()==='dark'?'light':'dark';d.setAttribute('data-theme',n);try{localStorage.setItem('theme',n)}catch(e){}lab()});
})();
