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
        unidades.push({ ...base, tipo: 'continua', cantidadBloques: cantidad })
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

// Identifica tramos de exactamente `tamano` bloques "clase" consecutivos
// en la grilla (sin recreo/almuerzo en medio), recorriendo el orden real
// de la grilla completa. Para tamano=2 da pares, para tamano=1 da bloques
// sueltos, para tamano=6 da tramos de 6 lecciones seguidas, etc.
function construirTramosConsecutivos(bloquesTodos, tamano) {
  const tramos = []
  for (let i = 0; i + tamano <= bloquesTodos.length; i++) {
    const candidato = bloquesTodos.slice(i, i + tamano)
    if (candidato.every(b => b.tipo === 'clase')) {
      tramos.push(candidato)
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

  // Cache de tramos consecutivos por tamaño, para no recalcularlos por cada unidad.
  const tramosPorTamano = {}
  function tramosDeTamano(tamano) {
    if (!tramosPorTamano[tamano]) {
      tramosPorTamano[tamano] = construirTramosConsecutivos(bloques, tamano)
    }
    return tramosPorTamano[tamano]
  }

  let unidades = construirUnidades(profesores)

  // Ordenar: las más restringidas primero; entre empates, las unidades más
  // grandes (continuas y dobles) antes que las sueltas, porque son más
  // difíciles de encajar y conviene resolverlas cuanto antes.
  unidades = unidades
    .map(u => ({ ...u, disponibilidad: calcularDisponibilidad(u, dias, bloquesClase) }))
    .sort((a, b) => {
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
    const tramos = tramosDeTamano(unidad.cantidadBloques)
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

  return {
    asignaciones,
    conflictos,
    generadoEn: new Date().toISOString(),
    completo: conflictos.length === 0,
  }
}
