redirectIfLoggedIn();

document.querySelector('[data-register-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  const message = document.querySelector('[data-auth-message]');
  setMessage(message, 'Creando cuenta...');
  try {
    const data = await authRequest('register', payload);
    setSession(data);
    window.location.href = '/dashboard';
  } catch (error) {
    setMessage(message, error.message, 'error');
  }
});
