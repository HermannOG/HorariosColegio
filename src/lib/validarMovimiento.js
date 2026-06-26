// ========================================================================
// VALIDADOR DE MOVIMIENTOS MANUALES
// ------------------------------------------------------------------------
// Cuando alguien arrastra una clase en la vista "Por grupo" para moverla
// a otro lugar (o intercambiarla con otra), este módulo decide si ese
// movimiento puntual es válido, usando las MISMAS reglas duras que ya usa
// el generador automático — para que la edición manual nunca produzca un
// horario que el generador automático no hubiera aceptado.
//
// No se reordena nada más: solo se evalúa el movimiento puntual que pide
// la persona. Si rompe alguna regla, se devuelve el motivo exacto para
// mostrarlo en una alerta, y no se aplica ningún cambio.
// ========================================================================

import { construirTramosConsecutivos } from './generador.js'

// Reconstruye, a partir de las asignaciones ya guardadas de un horario,
// la "unidad" completa a la que pertenece una asignación puntual — es
// decir, todas las lecciones consecutivas (en bloquesClase) que comparten
// profesor+materia+grupo+día. Esto es necesario porque al arrastrar una
// lección de un bloque doble o continuo, hay que mover TODO el bloque
// junto, nunca una sola lección suelta de él.
function obtenerUnidadCompleta(asignacion, asignaciones, bloquesClase) {
  const mismasCoordenadas = asignaciones.filter(a =>
    a.dia === asignacion.dia &&
    a.grupoId === asignacion.grupoId &&
    a.materiaId === asignacion.materiaId &&
    a.profesorId === asignacion.profesorId
  )
  const idsBloquesClase = bloquesClase.map(b => b.id)
  const indices = mismasCoordenadas
    .map(a => idsBloquesClase.indexOf(a.bloqueId))
    .filter(i => i !== -1)
    .sort((x, y) => x - y)

  // De esos candidatos, nos quedamos solo con el tramo CONSECUTIVO (en el
  // array de bloquesClase) que contiene al bloque de la asignación que se
  // está arrastrando — por si, en un caso raro, la misma materia+profesor
  // apareciera más de una vez ese día en tramos separados (no debería
  // pasar con las reglas actuales, pero por seguridad no los mezclamos).
  const indiceInicial = idsBloquesClase.indexOf(asignacion.bloqueId)
  let desde = indiceInicial
  let hasta = indiceInicial
  while (indices.includes(desde - 1)) desde--
  while (indices.includes(hasta + 1)) hasta++

  const bloqueIdsUnidad = idsBloquesClase.slice(desde, hasta + 1)
  return mismasCoordenadas
    .filter(a => bloqueIdsUnidad.includes(a.bloqueId))
    .sort((a, b) => idsBloquesClase.indexOf(a.bloqueId) - idsBloquesClase.indexOf(b.bloqueId))
}

// Determina si una unidad (de tamaño N) es de tipo "bloque continuo" según
// la malla curricular vigente, y si puede atravesar el almuerzo. Esto se
// necesita para saber qué tramos de destino son válidos para ella.
function obtenerReglasMateria(materiaId, grupoId, grupos, mallas) {
  const grupo = grupos.find(g => g.id === grupoId)
  if (!grupo) return { bloqueContinuo: false, puedeAtravesarAlmuerzo: false }
  const filasMalla = mallas[grupo.anio] || []
  const fila = filasMalla.find(f => f.materiaId === materiaId)
  return {
    bloqueContinuo: !!fila?.bloqueContinuo,
    puedeAtravesarAlmuerzo: !!fila?.puedeAtravesarAlmuerzo,
  }
}

// Verifica que un grupo de bloques de clase, en un día dado, sea un tramo
// VÁLIDO para una unidad de ese tipo (estrictamente consecutivo si es
// doble/suelta, permitiendo atravesar recreos/almuerzo si es continua).
function esTramoValido(bloqueIdsDestino, bloques, bloqueContinuo, puedeAtravesarAlmuerzo) {
  const tramosValidos = construirTramosConsecutivos(bloques, bloqueIdsDestino.length, bloqueContinuo, puedeAtravesarAlmuerzo)
  return tramosValidos.some(tramo => {
    const idsTramo = tramo.map(b => b.id)
    return idsTramo.length === bloqueIdsDestino.length && idsTramo.every((id, i) => id === bloqueIdsDestino[i])
  })
}

// Verifica que, quitando temporalmente la unidad que se mueve, el grupo no
// quede con un hueco en medio ese día (la regla de "siempre desde la 1ª
// lección, sin huecos, puede terminar antes pero no interrumpirse").
function dejaHuecoEnElGrupo(asignacionesDelDiaSinUnidad, bloquesClase) {
  const ocupados = new Set(asignacionesDelDiaSinUnidad.map(a => a.bloqueId))
  for (let i = 0; i < bloquesClase.length; i++) {
    if (ocupados.has(bloquesClase[i].id)) continue
    const hayClaseDespues = bloquesClase.slice(i + 1).some(b => ocupados.has(b.id))
    if (hayClaseDespues) return true
  }
  return false
}

// ------------------------------------------------------------------------
// Punto de entrada principal.
//
// `origen`: la asignación puntual que se arrastró (cualquier lección de la
//           unidad que se quiere mover).
// `destino`: { dia, bloqueId } — dónde se soltó.
// `horario`: { asignaciones } — el horario completo actual.
// `contexto`: { bloques, grupos, mallas } — datos necesarios para validar.
//
// Devuelve { valido: true, nuevasAsignaciones } o { valido: false, motivo }.
// `nuevasAsignaciones` es el array COMPLETO de asignaciones ya actualizado,
// listo para guardar, si el movimiento es válido.
// ------------------------------------------------------------------------
export function validarYAplicarMovimiento({ origen, destino, horario, contexto }) {
  const { bloques, grupos, mallas } = contexto
  const bloquesClase = bloques.filter(b => b.tipo === 'clase')
  const asignaciones = horario.asignaciones

  const unidadOrigen = obtenerUnidadCompleta(origen, asignaciones, bloquesClase)
  const tamanoUnidad = unidadOrigen.length
  const { bloqueContinuo, puedeAtravesarAlmuerzo } = obtenerReglasMateria(origen.materiaId, origen.grupoId, grupos, mallas)

  // ¿Hay alguna asignación ya puesta justo en el bloque de destino, para
  // este mismo grupo? Si es así, es un INTERCAMBIO; si no, es un MOVIMIENTO
  // a un hueco vacío.
  const ocupanteDestino = asignaciones.find(a =>
    a.dia === destino.dia && a.bloqueId === destino.bloqueId && a.grupoId === origen.grupoId
  )

  if (ocupanteDestino) {
    return intentarIntercambio({ origen, unidadOrigen, ocupanteDestino, asignaciones, bloques, bloquesClase, grupos, mallas })
  }

  return intentarMoverAHueco({ origen, unidadOrigen, destino, tamanoUnidad, bloqueContinuo, puedeAtravesarAlmuerzo, asignaciones, bloques, bloquesClase })
}

function intentarMoverAHueco({ origen, unidadOrigen, destino, tamanoUnidad, bloqueContinuo, puedeAtravesarAlmuerzo, asignaciones, bloques, bloquesClase }) {
  const indiceDestino = bloquesClase.findIndex(b => b.id === destino.bloqueId)
  if (indiceDestino === -1) {
    return { valido: false, motivo: 'Ese bloque no es una lección de clase (es recreo o almuerzo).' }
  }

  // El tramo de destino son `tamanoUnidad` bloques empezando en destino.
  const bloqueIdsDestino = bloquesClase.slice(indiceDestino, indiceDestino + tamanoUnidad).map(b => b.id)
  if (bloqueIdsDestino.length < tamanoUnidad) {
    return { valido: false, motivo: `No hay suficientes lecciones seguidas a partir de ahí (esta materia ocupa ${tamanoUnidad} lección(es) juntas).` }
  }

  if (!esTramoValido(bloqueIdsDestino, bloques, bloqueContinuo, puedeAtravesarAlmuerzo)) {
    return {
      valido: false,
      motivo: bloqueContinuo
        ? 'Ese destino no tiene suficientes lecciones seguidas respetando el almuerzo para esta materia.'
        : 'Esta materia debe quedar en lecciones realmente consecutivas (sin un recreo de por medio) y ese destino no lo permite.',
    }
  }

  // El destino no puede pisar ninguna asignación existente de ESTE grupo
  // (si las pisara, sería un intercambio, ya cubierto en otra función).
  const destinoOcupado = asignaciones.some(a =>
    a.dia === destino.dia && a.grupoId === origen.grupoId && bloqueIdsDestino.includes(a.bloqueId)
  )
  if (destinoOcupado) {
    return { valido: false, motivo: 'El destino se superpone con otra clase del mismo grupo. Soltá la clase justo sobre la otra para intercambiarlas.' }
  }

  // El profesor de la unidad debe estar libre en TODOS los bloques de
  // destino, ese día, en CUALQUIER otro grupo (no solo este).
  const profesorId = origen.profesorId
  const choqueProfesor = asignaciones.some(a =>
    a.profesorId === profesorId && a.dia === destino.dia && bloqueIdsDestino.includes(a.bloqueId) &&
    !unidadOrigen.some(u => u.bloqueId === a.bloqueId && u.grupoId === a.grupoId)
  )
  if (choqueProfesor) {
    return { valido: false, motivo: `${origen.profesorNombre} ya tiene otra clase asignada a esa hora en otro grupo.` }
  }

  // ¿La materia ya está ese día, en ese grupo, en otro horario? (no se
  // permite repetir la materia el mismo día, salvo que sea la propia
  // unidad que se está moviendo).
  const repiteMateriaEseDia = asignaciones.some(a =>
    a.grupoId === origen.grupoId && a.dia === destino.dia && a.materiaId === origen.materiaId &&
    !unidadOrigen.includes(a)
  )
  if (repiteMateriaEseDia) {
    return { valido: false, motivo: 'Esa materia ya está asignada otro momento de ese mismo día para este grupo.' }
  }

  // Simulamos el resultado y verificamos que el grupo no quede con un
  // hueco en medio ese día (ni en el día de origen, si cambia de día).
  const sinUnidadOrigen = asignaciones.filter(a => !unidadOrigen.includes(a))
  const nuevaUnidad = unidadOrigen.map((a, i) => ({ ...a, dia: destino.dia, bloqueId: bloqueIdsDestino[i] }))
  const nuevasAsignaciones = [...sinUnidadOrigen, ...nuevaUnidad]

  const diasAfectados = new Set([origen.dia, destino.dia])
  for (const dia of diasAfectados) {
    const delDia = nuevasAsignaciones.filter(a => a.grupoId === origen.grupoId && a.dia === dia)
    if (delDia.length > 0 && dejaHuecoEnElGrupo(delDia, bloquesClase)) {
      return { valido: false, motivo: `Ese movimiento dejaría un hueco sin clase en el día ${dia} para este grupo, lo cual no está permitido.` }
    }
  }

  return { valido: true, nuevasAsignaciones }
}

function intentarIntercambio({ origen, unidadOrigen, ocupanteDestino, asignaciones, bloques, bloquesClase, grupos, mallas }) {
  const unidadDestino = obtenerUnidadCompleta(ocupanteDestino, asignaciones, bloquesClase)

  if (unidadOrigen.length !== unidadDestino.length) {
    return {
      valido: false,
      motivo: `No se pueden intercambiar: una ocupa ${unidadOrigen.length} lección(es) y la otra ${unidadDestino.length}. Solo se pueden intercambiar bloques del mismo tamaño.`,
    }
  }
  if (unidadOrigen.some(a => unidadDestino.includes(a))) {
    return { valido: false, motivo: 'Esa es la misma clase; no hay nada que intercambiar.' }
  }

  const { bloqueContinuo: contOrigen, puedeAtravesarAlmuerzo: almOrigen } = obtenerReglasMateria(origen.materiaId, origen.grupoId, grupos, mallas)
  const { bloqueContinuo: contDestino, puedeAtravesarAlmuerzo: almDestino } = obtenerReglasMateria(ocupanteDestino.materiaId, ocupanteDestino.grupoId, grupos, mallas)

  const idsOrigenBloques = unidadOrigen.map(a => a.bloqueId)
  const idsDestinoBloques = unidadDestino.map(a => a.bloqueId)

  // El tramo que ocupaba el destino debe ser válido para la unidad de
  // origen (y viceversa) — por ejemplo, no se puede meter una unidad
  // continua en un tramo que solo era válido como par normal.
  if (!esTramoValido(idsDestinoBloques, bloques, contOrigen, almOrigen)) {
    return { valido: false, motivo: 'La materia que estás moviendo no puede ocupar ese horario (no respeta sus reglas de bloque).' }
  }
  if (!esTramoValido(idsOrigenBloques, bloques, contDestino, almDestino)) {
    return { valido: false, motivo: 'La materia que ya estaba ahí no podría ocupar el horario de origen (no respeta sus reglas de bloque).' }
  }

  // Choque de profesor: el profesor de origen debe estar libre en el día
  // de destino (considerando que su propia unidad se libera), y viceversa.
  // El grupo SIEMPRE es el mismo (origen.grupoId === ocupanteDestino.grupoId,
  // porque el intercambio ocurre dentro del horario de un solo grupo), así
  // que hay que revisar choques en CUALQUIER otro grupo donde el profesor
  // tenga clase a esa hora.
  const profesorOrigenId = origen.profesorId
  const profesorDestinoId = ocupanteDestino.profesorId

  const choqueProfesorOrigenEnDestino = asignaciones.some(a =>
    a.profesorId === profesorOrigenId && a.dia === ocupanteDestino.dia && idsDestinoBloques.includes(a.bloqueId) &&
    !unidadOrigen.includes(a) && !unidadDestino.includes(a)
  )
  if (choqueProfesorOrigenEnDestino) {
    return { valido: false, motivo: `${origen.profesorNombre} ya tiene otra clase a esa hora en otro grupo.` }
  }

  const choqueProfesorDestinoEnOrigen = asignaciones.some(a =>
    a.profesorId === profesorDestinoId && a.dia === origen.dia && idsOrigenBloques.includes(a.bloqueId) &&
    !unidadOrigen.includes(a) && !unidadDestino.includes(a)
  )
  if (choqueProfesorDestinoEnOrigen) {
    return { valido: false, motivo: `${ocupanteDestino.profesorNombre} ya tiene otra clase a esa hora en otro grupo.` }
  }

  // Repetición de materia el mismo día tras el intercambio, dentro del
  // mismo grupo (si ambas unidades quedan en días distintos a los
  // originales).
  const grupoId = origen.grupoId
  if (origen.dia !== ocupanteDestino.dia) {
    const repiteOrigenEnDestino = asignaciones.some(a =>
      a.grupoId === grupoId && a.dia === ocupanteDestino.dia && a.materiaId === origen.materiaId && !unidadOrigen.includes(a) && !unidadDestino.includes(a)
    )
    if (repiteOrigenEnDestino) {
      return { valido: false, motivo: 'Esa materia ya está asignada otro momento ese mismo día para este grupo.' }
    }
    const repiteDestinoEnOrigen = asignaciones.some(a =>
      a.grupoId === grupoId && a.dia === origen.dia && a.materiaId === ocupanteDestino.materiaId && !unidadOrigen.includes(a) && !unidadDestino.includes(a)
    )
    if (repiteDestinoEnOrigen) {
      return { valido: false, motivo: 'La materia que ya estaba ahí quedaría repetida otro momento ese mismo día.' }
    }
  }

  // Construir el resultado del intercambio: ambas unidades cambian de
  // posición, pero el grupo no cambia (siempre es el grupo que se está
  // viendo en la vista "Por grupo").
  const sinAmbas = asignaciones.filter(a => !unidadOrigen.includes(a) && !unidadDestino.includes(a))
  const nuevaUnidadOrigen = unidadOrigen.map((a, i) => ({
    ...a, dia: ocupanteDestino.dia, bloqueId: idsDestinoBloques[i],
  }))
  const nuevaUnidadDestino = unidadDestino.map((a, i) => ({
    ...a, dia: origen.dia, bloqueId: idsOrigenBloques[i],
  }))
  const nuevasAsignaciones = [...sinAmbas, ...nuevaUnidadOrigen, ...nuevaUnidadDestino]

  // Verificar que el grupo no quede con hueco en ninguno de los 2 días
  // afectados.
  const diasAfectados = new Set([origen.dia, ocupanteDestino.dia])
  for (const dia of diasAfectados) {
    const delDia = nuevasAsignaciones.filter(a => a.grupoId === grupoId && a.dia === dia)
    if (delDia.length > 0 && dejaHuecoEnElGrupo(delDia, bloquesClase)) {
      return { valido: false, motivo: `Ese intercambio dejaría un hueco sin clase el día ${dia}.` }
    }
  }

  return { valido: true, nuevasAsignaciones }
}
