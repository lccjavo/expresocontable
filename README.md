# Expreso Contable

App Bootstrap 5.3 para análisis histórico de CFDI con persistencia por usuario en Netlify Blobs.

## Netlify

Build command:

```bash
npm run build
```

Publish directory:

```txt
public
```

Functions directory:

```txt
netlify/functions
```

Variable requerida:

```txt
JWT_SECRET=una_clave_larga_random
```

## Pruebas

El build ahora corre pruebas antes de publicar:

```bash
npm test
npm run build
```

`npm run build` ejecuta:

```bash
npm test && node scripts/build-check.mjs
```

Las pruebas cubren:

- existencia y contrato de todas las funciones Netlify;
- protección de funciones persistentes con autenticación;
- conexión obligatoria a Netlify Blobs en funciones que leen/escriben histórico;
- health check;
- auth helpers, JWT y validación de password cuando las dependencias ya están instaladas;
- rutas limpias sin `.html`;
- configuración de `netlify.toml`;
- existencia de páginas principales.

En un entorno local sin `npm install`, las pruebas que necesitan `@netlify/blobs`, `bcryptjs` y `jsonwebtoken` se saltan de forma segura. En Netlify, esas dependencias se instalan antes del build, así que las pruebas runtime se ejecutan completas.


## Fix filtros reactivos

- Los filtros de mes, fecha, RFC, tipo y producto ahora recalculan inmediatamente las tarjetas principales, tablas, gráficas y cálculo de impuestos.
- Las facturas sin fecha ya no se quedan visibles cuando se filtra por rango de fechas.
- La búsqueda de producto/concepto también revisa nombre de archivo, emisor, receptor y claves del concepto.

## Cambios: filtro por año y separación histórica

- Los CFDI ahora se agrupan internamente por `byYear` y `byMonth`.
- Los filtros incluyen `Año` y `Mes`; el año se selecciona por defecto al año actual o al último año disponible.
- Al subir CFDI de otro año, no se mezclan en la vista actual si el filtro de año está activo.
- El resumen guardado de Uploads ahora permite filtrar por año/mes y borrar todo, un año completo o un mes específico.
- La función `clear-analysis` acepta `scope=year` además de `month` y `all`.
