import { existsSync } from 'node:fs';

const required = [
  'public/index.html',
  'public/login/index.html',
  'public/register/index.html',
  'public/dashboard/index.html',
  'public/uploads/index.html',
  'public/uploads/progreso/index.html',
  'public/facturas/index.html',
  'public/declaraciones/index.html',
  'public/conciliacion/index.html',
  'public/reportes/index.html',
  'public/productos/index.html',
  'public/calculo-impuestos/index.html',
  'public/settings/index.html',
  'public/_redirects',
  'public/assets/css/styles.css',
  'public/assets/js/common.js',
  'public/assets/js/login.js',
  'public/assets/js/register.js',
  'public/assets/js/protected.js',
  'public/assets/js/uploads.js',
  'public/assets/js/settings.js',
  'public/favicon.ico',
  'public/site.webmanifest',
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error('Missing required files:', missing.join(', '));
  process.exit(1);
}

console.log('Build check passed. Static multi-page app is ready for Netlify.');
