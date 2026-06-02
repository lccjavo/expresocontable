redirectIfLoggedIn();

document.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  const message = document.querySelector('[data-auth-message]');
  setMessage(message, 'Entrando...');
  try {
    const data = await authRequest('login', payload);
    setSession(data);
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get('next') || '/dashboard';
  } catch (error) {
    setMessage(message, error.message, 'error');
  }
});
