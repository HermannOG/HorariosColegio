# Horarios — Liceo

Aplicación web para armar los horarios de profesores de un colegio: se cargan profesores (con sus preferencias, días libres y materias/grupos que imparten), los grupos del año y las materias, y el sistema genera el horario automáticamente respetando los choques y, en lo posible, las preferencias.

## ¿Cómo funciona?

- **Frontend:** React + Vite + Tailwind CSS.
- **Base de datos:** Firebase Firestore (todo se guarda en la nube; varias personas pueden entrar y ver los mismos datos).
- **Generador de horarios:** algoritmo propio en `src/lib/generador.js` que ubica cada lección evitando choques de profesor y de grupo, y reportando como "conflicto" cualquier lección que no logró ubicarse, para resolverla a mano.

## 1. Instalación local

Necesitás tener [Node.js](https://nodejs.org/) instalado (versión 18 o más reciente).

```bash
npm install
```

## 2. Configurar Firebase

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com/) y creá un proyecto nuevo (es gratis para este uso).
2. Dentro del proyecto, andá a **Compilación → Firestore Database** y creá una base de datos (modo producción o de prueba, cualquiera sirve para empezar).
3. En **Reglas** de Firestore, por ahora (mientras no hay login) usá algo simple para poder leer y escribir. Por ejemplo:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

   ⚠️ Esto deja la base abierta a cualquiera que tenga la URL. Sirve para probar, pero antes de compartir la app públicamente conviene agregar autenticación (lo podemos hacer después).

4. Andá a **Configuración del proyecto → General → Tus apps** y creá una app web (ícono `</>`). Copiá los datos de configuración (`apiKey`, `authDomain`, etc.).
5. Copiá el archivo `.env.example` a `.env`:

   ```bash
   cp .env.example .env
   ```

6. Pegá los valores que copiaste de Firebase en el archivo `.env`.

## 3. Correr la app en tu computadora

```bash
npm run dev
```

Se abre en `http://localhost:5173`. Cualquier cambio que hagas en el código se actualiza solo.

## 4. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

(Creá antes el repositorio vacío en github.com, sin README, y reemplazá la URL de arriba por la tuya.)

**Importante:** el archivo `.env` con tus credenciales de Firebase nunca se sube a GitHub (ya está en `.gitignore`). Eso es así a propósito, por seguridad.

## 5. Publicar la app para que otros la usen (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

Cuando te pregunte:
- Carpeta pública: `dist`
- ¿Configurar como single-page app? **Sí**
- ¿Sobrescribir index.html? **No**

Luego, cada vez que quieras publicar una actualización:

```bash
npm run build
firebase deploy
```

Te va a dar una URL pública (algo como `https://tu-proyecto.web.app`) que cualquier administrativo puede abrir desde el navegador.

## Estructura del proyecto

```
src/
  lib/
    firebase.js     -> conexión a Firebase
    datos.js        -> funciones para leer/guardar profesores, grupos, materias, horario
    generador.js    -> el algoritmo que genera el horario automáticamente
  pages/
    InicioPage.jsx       -> panel general
    GrillaPage.jsx       -> configurar las horas/lecciones/recreos del día
    MateriasPage.jsx     -> gestionar materias
    GruposPage.jsx       -> gestionar grupos (año + secciones)
    ProfesoresPage.jsx   -> gestionar profesores y sus asignaciones
    HorarioPage.jsx      -> generar y ver el horario (por profesor o por grupo)
  components/
    ui.jsx           -> botones, tarjetas, campos de formulario reutilizables
```

## Cómo usar la app, paso a paso

1. **Grilla del día:** definí las horas de cada lección, recreo y almuerzo (se aplica de lunes a viernes).
2. **Materias:** agregá las materias del colegio.
3. **Grupos:** elegí un año y cuántas secciones tiene, y se crean de una vez (ej: 9° año con 6 secciones crea 9-1 a 9-6). Esto se puede repetir cada año si cambia la cantidad de grupos.
4. **Profesores:** agregá cada profesor con sus días libres, bloques preferidos/a evitar, y la lista de grupos+materias que da, con cuántas lecciones por semana necesita cada uno.
5. **Horario:** hacé clic en "Generar horario". Si alguna lección no se pudo ubicar sin choques, aparece marcada para que la ajustés a mano. Podés ver el resultado por profesor o por grupo.

## Sobre el algoritmo generador

Funciona en dos pasos:

1. Intenta un **backtracking completo** (prueba combinaciones y retrocede si encuentra un choque) cuando la cantidad de lecciones es manejable. Esto encuentra una solución sin conflictos si existe.
2. Si el conjunto de datos es muy grande o no hay solución perfecta, usa un modo más rápido que coloca cada lección en el mejor bloque disponible y, si ninguno sirve, la reporta como conflicto en lugar de trabarse.

Las preferencias de bloque (preferidos / a evitar) influyen en qué horario se elige primero, pero nunca a costa de generar un choque real.
