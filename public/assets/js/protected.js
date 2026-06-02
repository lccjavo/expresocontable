requireAuth();

document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  document.querySelectorAll('[data-user-email]').forEach((el) => {
    el.textContent = user.email || '';
  });
});
