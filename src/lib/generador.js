// ========================================================================
// GENERADOR DE HORARIOS
// ------------------------------------------------------------------------
// Idea central: en un colegio real, las lecciones de una materia casi
// nunca se ubican sueltas una por una. Se agrupan en "bloques dobles"
// (2 lecciones seguidas, el mismo día) cuando la cantidad lo permite, y
// el resto queda en lecciones sueltas. Por eso el generador no coloca
// "lecciones individuales": primero arma la lista de UNIDADES a ubicar
// (dobles, sueltas, o continuas) para cada profesor+grupo+materia, y
// después ubica cada unidad completa en el horario.
//
// 1. Por cada asignación (profesor, grupo, materia, leccionesPorSemana,
//    bloqueContinuo) se generan unidades:
//      - Si bloqueContinuo es true: UNA sola unidad de tipo 'continua'
//        que ocupa TODAS las lecciones de la semana, seguidas, el mismo
//        día (ej: Tecnología con 6 lecciones -> 1 unidad de 6 bloques
//        consecutivos, sin recreo en medio). No se permite partirla.
//      - Si no: tantos bloques dobles como sea posible, más una suelta
//        si la cantidad es impar.
//          Ej: 6 lecciones -> 3 unidades dobles.
//          Ej: 5 lecciones -> 2 unidades dobles + 1 suelta.
// 2. Las unidades se ordenan de la más restringida a la menos (menos
//    días disponibles primero), y dentro de eso, las continuas y dobles
//    antes que las sueltas (son más difíciles de encajar).
// 3. Para cada unidad se buscan tramos de bloques consecutivos (según su
//    tamaño: 1 para suelta, 2 para doble, N para continua) en cada día,
//    respetando:
//      - Un profesor no puede estar en 2 lugares a la vez.
//      - Un grupo no puede tener 2 materias a la vez.
//      - El profesor no trabaja ese día -> bloqueado.
//      - Solo se usan bloques de tipo 'clase', consecutivos en la
//        grilla (sin un recreo/almuerzo en medio que los separe).
//      - La misma materia+grupo no se repite el mismo día salvo que
//        sea, precisamente, la propia unidad (que ya ocupa varios
//        bloques de ese día a la vez).
// 4. Restricciones blandas (se intentan, no obligatorias): bloques
//    preferidos / evitados del profesor, y modo de reparto cuando la
//    cantidad es impar ('parejo' = repartir la suelta en un día con
//    poca carga; 'temprano' = concentrar para que un día puntual salga
//    antes, sin pasar nunca de cierto límite de lecciones diarias).
// 5. Si una unidad no logra ubicarse, se reporta como conflicto y se
//    sigue con las demás, sin trabar el resto del horario. Una unidad
//    'continua' que no encuentra ningún día con suficientes bloques
//    seguidos libres se reporta completa como conflicto (no se parte).
// ========================================================================

function construirUnidades(profesores) {
  const unidades = []
  for (const prof of profesores) {
    const asignaciones = prof.asignaciones || []
    for (const asig of asignaciones) {
      const cantidad = Number(asig.leccionesPorSemana) || 0
      if (cantidad <= 0) continue

      const base = {
        profesorId: prof.id,
        profesorNombre: prof.nombre,
        grupoId: asig.grupoId,
        materiaId: asig.materiaId,
        diasNoTrabaja: prof.diasNoTrabaja || [],
        bloquesPreferidos: prof.bloquesPreferidos || [],
        bloquesEvitados: prof.bloquesEvitados || [],
      }

      if (asig.bloqueContinuo) {
        unidades.push({
          ...base,
          tipo: 'continua',
          cantidadBloques: cantidad,
          puedeAtravesarAlmuerzo: !!asig.puedeAtravesarAlmuerzo,
        })
        continue
      }

      const dobles = Math.floor(cantidad / 2)
      const sueltaExtra = cantidad % 2 === 1
      for (let i = 0; i < dobles; i++) {
        unidades.push({ ...base, tipo: 'doble', cantidadBloques: 2 })
      }
      if (sueltaExtra) {
        unidades.push({ ...base, tipo: 'suelta', cantidadBloques: 1 })
      }
    }
  }
  return unidades
}

// Identifica tramos de exactamente `tamano` bloques de tipo 'clase'
// (lecciones reales) en la grilla.
//
// - Si `permitirAtravesarRecreos` es false (caso normal: dobles y sueltas),
//   el tramo debe ser estrictamente consecutivo, sin nada en medio — el
//   comportamiento de siempre.
// - Si es true (caso de "bloque continuo", ej. Tecnología), se permite que
//   en el camino haya recreos (siempre se atraviesan, nunca cuentan como
//   interrupción) y, si `puedeAtravesarAlmuerzo` es true, también el bloque
//   de almuerzo. Cualquier otro corte (almuerzo no permitido) termina el
//   tramo ahí.
//
// Devuelve un array de tramos, cada uno como un array de exactamente
// `tamano` bloques de tipo 'clase' (los recreos/almuerzo atravesados no se
// incluyen en el resultado, porque no se "ocupan", solo se permite que
// estén en medio del tramo).
function construirTramosConsecutivos(bloquesTodos, tamano, permitirAtravesarRecreos = false, puedeAtravesarAlmuerzo = false) {
  if (!permitirAtravesarRecreos) {
    // Comportamiento estricto de siempre: ventana de `tamano` bloques
    // consecutivos en la grilla, todos de tipo 'clase'.
    const tramos = []
    for (let i = 0; i + tamano <= bloquesTodos.length; i++) {
      const candidato = bloquesTodos.slice(i, i + tamano)
      if (candidato.every(b => b.tipo === 'clase')) {
        tramos.push(candidato)
      }
    }
    return tramos
  }

  const tramos = []
  for (let inicio = 0; inicio < bloquesTodos.length; inicio++) {
    if (bloquesTodos[inicio].tipo !== 'clase') continue
    const leccionesDelTramo = []
    for (let i = inicio; i < bloquesTodos.length; i++) {
      const bloque = bloquesTodos[i]
      if (bloque.tipo === 'clase') {
        leccionesDelTramo.push(bloque)
        if (leccionesDelTramo.length === tamano) break
      } else if (bloque.tipo === 'recreo') {
        continue // los recreos siempre se pueden atravesar
      } else if (bloque.tipo === 'almuerzo' && puedeAtravesarAlmuerzo) {
        continue // el almuerzo se atraviesa solo si está permitido para esta materia
      } else {
        break // corte real: almuerzo no permitido, u otro tipo de bloque
      }
    }
    if (leccionesDelTramo.length === tamano) {
      tramos.push(leccionesDelTramo)
    }
  }
  return tramos
}

function calcularDisponibilidad(unidad, dias, bloquesClase) {
  const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
  return diasDisponibles.length * bloquesClase.length
}

export function generarHorario({ profesores, dias, bloques, modoReparto = 'parejo' }) {
  const bloquesClase = bloques.filter(b => b.tipo === 'clase')

  // Cache de tramos consecutivos por (tamaño, si atraviesa recreos, si
  // atraviesa almuerzo), para no recalcularlos por cada unidad.
  const tramosPorClave = {}
  function tramosDeTamano(tamano, permitirAtravesarRecreos, puedeAtravesarAlmuerzo) {
    const clave = `${tamano}|${permitirAtravesarRecreos}|${puedeAtravesarAlmuerzo}`
    if (!tramosPorClave[clave]) {
      tramosPorClave[clave] = construirTramosConsecutivos(bloques, tamano, permitirAtravesarRecreos, puedeAtravesarAlmuerzo)
    }
    return tramosPorClave[clave]
  }

  let unidades = construirUnidades(profesores)

  // Ordenar: las unidades 'continua' SIEMPRE van primero, sin excepción.
  // Necesitan un tramo exacto de N bloques consecutivos en la grilla, que es
  // una restricción mucho más rígida que "tener huecos sueltos disponibles"
  // — si se colocan después de materias normales, esas materias normales ya
  // habrán ocupado huecos sueltos por toda la semana y no va a quedar ningún
  // tramo largo libre, aunque en teoría sí cupiera todo si se acomodara bien
  // desde el principio. Por eso reservamos su lugar primero, y el resto de
  // las materias se acomodan alrededor de lo que ya quedó fijo.
  // Dentro de cada grupo (continua vs. no-continua), ordenamos por la
  // disponibilidad real del profesor (menos días libres primero), y dentro
  // de eso, las unidades más grandes (dobles) antes que las sueltas.
  unidades = unidades
    .map(u => ({ ...u, disponibilidad: calcularDisponibilidad(u, dias, bloquesClase) }))
    .sort((a, b) => {
      const aEsContinua = a.tipo === 'continua'
      const bEsContinua = b.tipo === 'continua'
      if (aEsContinua !== bEsContinua) return aEsContinua ? -1 : 1
      if (a.disponibilidad !== b.disponibilidad) return a.disponibilidad - b.disponibilidad
      return b.cantidadBloques - a.cantidadBloques
    })

  const ocupacionProfesor = {}  // `${profId}|${dia}|${bloqueId}` -> true
  const ocupacionGrupo = {}     // `${grupoId}|${dia}|${bloqueId}` -> true
  const materiaGrupoDia = {}    // `${grupoId}|${materiaId}|${dia}` -> true
  const leccionesPorDiaGrupo = {} // `${grupoId}|${dia}` -> cantidad de lecciones ese día

  const asignaciones = []
  const conflictos = []

  function kProf(profId, dia, bloqueId) { return `${profId}|${dia}|${bloqueId}` }
  function kGrupo(grupoId, dia, bloqueId) { return `${grupoId}|${dia}|${bloqueId}` }
  function kMatDia(grupoId, materiaId, dia) { return `${grupoId}|${materiaId}|${dia}` }
  function kCargaDia(grupoId, dia) { return `${grupoId}|${dia}` }

  function colocar(unidad, dia, bloquesAOcupar) {
    for (const bloque of bloquesAOcupar) {
      ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)] = true
      ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)] = true
      asignaciones.push({
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        dia,
        bloqueId: bloque.id,
      })
    }
    materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)] = true
    const k = kCargaDia(unidad.grupoId, dia)
    leccionesPorDiaGrupo[k] = (leccionesPorDiaGrupo[k] || 0) + bloquesAOcupar.length
  }

  function puntajeBloque(unidad, bloque) {
    let puntaje = 0
    if (unidad.bloquesPreferidos.includes(bloque.id)) puntaje += 10
    if (unidad.bloquesEvitados.includes(bloque.id)) puntaje -= 10
    return puntaje
  }

  // Genera las opciones (día, tramo de bloques) para una unidad, del
  // tamaño que sea (1 = suelta, 2 = doble, N = continua), ordenadas por
  // preferencia del profesor y por el modo de reparto.
  function opcionesParaUnidad(unidad) {
    const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
    const esContinua = unidad.tipo === 'continua'
    const tramos = tramosDeTamano(unidad.cantidadBloques, esContinua, esContinua && unidad.puedeAtravesarAlmuerzo)
    const opciones = []
    for (const dia of diasDisponibles) {
      for (const tramo of tramos) {
        let puntaje = tramo.reduce((acc, b) => acc + puntajeBloque(unidad, b), 0)
        const carga = leccionesPorDiaGrupo[kCargaDia(unidad.grupoId, dia)] || 0
        if (modoReparto === 'parejo') {
          puntaje -= carga // preferir días con MENOS carga acumulada -> reparte parejo
        } else if (modoReparto === 'temprano') {
          puntaje += carga // preferir días con MÁS carga acumulada -> concentra, deja otros días libres
        }
        opciones.push({ dia, bloques: tramo, puntaje })
      }
    }
    opciones.sort((a, b) => b.puntaje - a.puntaje)
    return opciones
  }

  function cabeSinChoque(unidad, dia, bloquesAOcupar, permitirRepetirMateriaDia) {
    for (const bloque of bloquesAOcupar) {
      if (ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)]) return false
      if (ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)]) return false
    }
    if (!permitirRepetirMateriaDia && materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)]) return false
    return true
  }

  function intentarUnidad(unidad) {
    const opciones = opcionesParaUnidad(unidad)

    // Primera pasada: sin permitir que la materia se repita el mismo día
    // (salvo que sea la propia unidad, que ocupa varios bloques del mismo
    // día a la vez — eso es válido porque es UNA sola unidad).
    for (const permitirRepetir of [false, true]) {
      for (const { dia, bloques: bloquesOpcion } of opciones) {
        if (cabeSinChoque(unidad, dia, bloquesOpcion, permitirRepetir)) {
          colocar(unidad, dia, bloquesOpcion)
          return true
        }
      }
    }
    return false
  }

  for (const unidad of unidades) {
    const ok = intentarUnidad(unidad)
    if (!ok) {
      const motivoPorTipo = {
        continua: `No se encontró un día con ${unidad.cantidadBloques} lecciones seguidas libres sin choques (la materia exige bloque continuo).`,
        doble: 'No se encontró un bloque doble (2 lecciones seguidas) libre sin choques.',
        suelta: 'No se encontró un bloque libre sin choques.',
      }
      conflictos.push({
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        motivo: motivoPorTipo[unidad.tipo] || 'No se encontró un bloque libre sin choques.',
      })
    }
  }

  // ----------------------------------------------------------------------
  // FASE 2 — Compactar huecos: cada grupo, cada día, debe tener sus
  // lecciones ocupando un tramo ininterrumpido desde el primer bloque de
  // clase del día (puede terminar antes, pero nunca con un hueco en medio).
  // El generador de arriba no garantiza esto por sí solo, porque distintas
  // materias se van colocando una por una sin coordinarse entre sí. Acá
  // reparamos cualquier hueco que haya quedado, moviendo lecciones hacia
  // atrás. Un movimiento solo es válido si el profesor de esa lección
  // sigue libre en el nuevo horario (no puede chocar con otra clase que
  // ya tenga en otro grupo a esa hora). Si mover una lección directamente
  // no es posible, se intenta encadenar con otras lecciones del mismo
  // grupo+día que sí puedan moverse, antes de rendirse y dejar el hueco
  // (que se reporta como advertencia).
  const huecosNoReparables = compactarHuecos({
    bloquesClase, dias, grupos: [...new Set(unidades.map(u => u.grupoId))],
    asignaciones, ocupacionProfesor, ocupacionGrupo,
  })
  for (const h of huecosNoReparables) {
    conflictos.push({
      profesorId: null,
      profesorNombre: null,
      grupoId: h.grupoId,
      materiaId: null,
      motivo: `quedó un hueco sin clase el día ${h.dia} (lección ${h.bloqueNumero || h.bloqueId}) que no se pudo cerrar sin generar un choque de profesor.`,
    })
  }

  return {
    asignaciones,
    conflictos,
    generadoEn: new Date().toISOString(),
    completo: conflictos.length === 0,
  }
}

// Recorre cada grupo y cada día, y busca un REORDENAMIENTO válido de las
// lecciones de ese día (mismo conjunto de materias/profesores, solo cambia
// EN QUÉ BLOQUE cae cada una) tal que no quede ningún hueco en medio —
// es decir, que ocupen exactamente los primeros N bloques de clase del día.
// Usa backtracking: para cada bloque de clase del día (en orden), prueba
// asignarle alguna de las lecciones pendientes cuyo profesor esté libre en
// ese bloque (considerando lo que el profesor tiene en TODOS los demás
// grupos ese mismo día, no solo este grupo). Si en algún punto ninguna
// lección pendiente cabe, retrocede y prueba otro orden.
// Modifica `asignaciones` y las tablas de ocupación in-place cuando
// encuentra una solución. Si no encuentra ninguna, deja ese día como
// estaba y lo reporta como hueco no reparable.
function compactarHuecos({ bloquesClase, dias, grupos, asignaciones, ocupacionProfesor, ocupacionGrupo }) {
  function kProf(profId, dia, bloqueId) { return `${profId}|${dia}|${bloqueId}` }
  function kGrupo(grupoId, dia, bloqueId) { return `${grupoId}|${dia}|${bloqueId}` }

  const huecosNoReparables = []

  for (const grupoId of grupos) {
    for (const dia of dias) {
      const asignacionesDelDia = asignaciones.filter(a => a.grupoId === grupoId && a.dia === dia)
      if (asignacionesDelDia.length === 0) continue

      const cantidad = asignacionesDelDia.length
      const bloquesObjetivo = bloquesClase.slice(0, cantidad) // los primeros N bloques, sin huecos

      // ¿Ya está compacto? (todas las asignaciones ya caen exactamente en
      // los primeros N bloques de clase del día) -> nada que hacer.
      const idsObjetivo = new Set(bloquesObjetivo.map(b => b.id))
      const yaCompacto = asignacionesDelDia.every(a => idsObjetivo.has(a.bloqueId))
      if (yaCompacto) continue

      // Antes de mover nada, liberamos temporalmente la ocupación de estas
      // lecciones (de profesor y de grupo) para poder probar combinaciones
      // sin que choquen contra sí mismas.
      for (const a of asignacionesDelDia) {
        delete ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)]
        delete ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)]
      }

      const pendientes = [...asignacionesDelDia]
      const asignacionPorBloque = new Array(bloquesObjetivo.length).fill(null)

      function backtrack(indexBloque) {
        if (indexBloque === bloquesObjetivo.length) return true
        const bloque = bloquesObjetivo[indexBloque]
        for (let i = 0; i < pendientes.length; i++) {
          const candidata = pendientes[i]
          if (!candidata) continue
          const kProfDestino = kProf(candidata.profesorId, dia, bloque.id)
          if (ocupacionProfesor[kProfDestino]) continue // el profesor ya tiene algo ahí en OTRO grupo

          asignacionPorBloque[indexBloque] = candidata
          pendientes[i] = null
          ocupacionProfesor[kProfDestino] = true // marcar temporalmente para las siguientes pruebas

          if (backtrack(indexBloque + 1)) return true

          // deshacer y probar la siguiente candidata
          delete ocupacionProfesor[kProfDestino]
          pendientes[i] = candidata
          asignacionPorBloque[indexBloque] = null
        }
        return false
      }

      const exito = backtrack(0)

      if (exito) {
        // Aplicar el nuevo orden: actualizar bloqueId de cada asignación y
        // dejar las tablas de ocupación consistentes (ocupacionProfesor ya
        // quedó marcada por el backtracking; falta ocupacionGrupo).
        for (let i = 0; i < bloquesObjetivo.length; i++) {
          const asig = asignacionPorBloque[i]
          asig.bloqueId = bloquesObjetivo[i].id
          ocupacionGrupo[kGrupo(grupoId, dia, bloquesObjetivo[i].id)] = true
        }
      } else {
        // No se encontró ningún reordenamiento sin choques: restauramos las
        // posiciones originales y dejamos las tablas de ocupación como antes.
        for (const a of asignacionesDelDia) {
          ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)] = true
          ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)] = true
        }
        // Reportar el primer hueco real que haya quedado en este día.
        const ocupados = new Set(asignacionesDelDia.map(a => a.bloqueId))
        for (let i = 0; i < bloquesClase.length; i++) {
          if (ocupados.has(bloquesClase[i].id)) continue
          const hayClaseDespues = bloquesClase.slice(i + 1).some(b => ocupados.has(b.id))
          if (hayClaseDespues) {
            huecosNoReparables.push({ grupoId, dia, bloqueId: bloquesClase[i].id, bloqueNumero: bloquesClase[i].numero })
            break
          }
        }
      }
    }
  }

  return huecosNoReparables
}
