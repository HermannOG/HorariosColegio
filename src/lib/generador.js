// ========================================================================
// GENERADOR DE HORARIOS
// ------------------------------------------------------------------------
// Idea central: en un colegio real, las lecciones de una materia casi
// nunca se ubican sueltas una por una. Se agrupan en "bloques dobles"
// (2 lecciones seguidas, el mismo día) cuando la cantidad lo permite, y
// el resto queda en lecciones sueltas. Por eso el generador no coloca
// "lecciones individuales": primero arma la lista de UNIDADES a ubicar
// (dobles y sueltas) para cada profesor+grupo+materia, y después ubica
// cada unidad completa en el horario.
//
// 1. Por cada asignación (profesor, grupo, materia, leccionesPorSemana)
//    se generan unidades: tantos bloques dobles como sea posible, más
//    una suelta si la cantidad es impar.
//      Ej: 6 lecciones -> 3 unidades dobles.
//      Ej: 5 lecciones -> 2 unidades dobles + 1 suelta.
//      Ej: 3 lecciones -> 1 unidad doble + 1 suelta.
// 2. Las unidades se ordenan de la más restringida a la menos (menos
//    días disponibles primero), y dentro de eso, los dobles antes que
//    las sueltas (son más difíciles de encajar).
// 3. Para cada unidad se buscan pares de bloques consecutivos (si es
//    doble) o un bloque (si es suelta), respetando:
//      - Un profesor no puede estar en 2 lugares a la vez.
//      - Un grupo no puede tener 2 materias a la vez.
//      - El profesor no trabaja ese día -> bloqueado.
//      - Solo se usan bloques de tipo 'clase', y los dobles deben ser
//        bloques "clase" consecutivos en la grilla (sin un recreo en
//        medio que los separe).
//      - La misma materia+grupo no se repite el mismo día salvo que
//        sea, precisamente, la unidad doble que ya cubre ese día.
// 4. Restricciones blandas (se intentan, no obligatorias): bloques
//    preferidos / evitados del profesor, y modo de reparto cuando la
//    cantidad es impar ('parejo' = repartir la suelta en un día con
//    poca carga; 'temprano' = concentrar para que un día puntual salga
//    antes, sin pasar nunca de cierto límite de lecciones diarias).
// 5. Si una unidad no logra ubicarse, se reporta como conflicto y se
//    sigue con las demás, sin trabar el resto del horario.
// ========================================================================

function construirUnidades(profesores, modoReparto) {
  const unidades = []
  for (const prof of profesores) {
    const asignaciones = prof.asignaciones || []
    for (const asig of asignaciones) {
      const cantidad = Number(asig.leccionesPorSemana) || 0
      if (cantidad <= 0) continue
      const dobles = Math.floor(cantidad / 2)
      const sueltaExtra = cantidad % 2 === 1

      const base = {
        profesorId: prof.id,
        profesorNombre: prof.nombre,
        grupoId: asig.grupoId,
        materiaId: asig.materiaId,
        diasNoTrabaja: prof.diasNoTrabaja || [],
        bloquesPreferidos: prof.bloquesPreferidos || [],
        bloquesEvitados: prof.bloquesEvitados || [],
      }

      for (let i = 0; i < dobles; i++) {
        unidades.push({ ...base, tipo: 'doble' })
      }
      if (sueltaExtra) {
        unidades.push({ ...base, tipo: 'suelta' })
      }
    }
  }
  return unidades
}

// Identifica pares de bloques "clase" consecutivos en la grilla (sin
// recreo/almuerzo en medio), por ejemplo [b1,b2], [b3,b4], [b5,b6]...
// Se basa en el orden real de los bloques en la grilla completa.
function construirParesConsecutivos(bloquesTodos) {
  const pares = []
  for (let i = 0; i < bloquesTodos.length - 1; i++) {
    const actual = bloquesTodos[i]
    const siguiente = bloquesTodos[i + 1]
    if (actual.tipo === 'clase' && siguiente.tipo === 'clase') {
      pares.push([actual, siguiente])
    }
  }
  return pares
}

function calcularDisponibilidad(unidad, dias, bloquesClase) {
  const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
  return diasDisponibles.length * bloquesClase.length
}

export function generarHorario({ profesores, dias, bloques, modoReparto = 'parejo', maxLeccionesPorDiaCorto = null }) {
  const bloquesClase = bloques.filter(b => b.tipo === 'clase')
  const paresConsecutivos = construirParesConsecutivos(bloques)

  let unidades = construirUnidades(profesores, modoReparto)

  // Ordenar: las más restringidas primero; entre empates, los dobles antes
  // que las sueltas (son más difíciles de encajar y conviene resolverlos ya).
  unidades = unidades
    .map(u => ({ ...u, disponibilidad: calcularDisponibilidad(u, dias, bloquesClase) }))
    .sort((a, b) => {
      if (a.disponibilidad !== b.disponibilidad) return a.disponibilidad - b.disponibilidad
      if (a.tipo !== b.tipo) return a.tipo === 'doble' ? -1 : 1
      return 0
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

  function deshacer(unidad, dia, bloquesAOcupar) {
    for (const bloque of bloquesAOcupar) {
      delete ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)]
      delete ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)]
    }
    delete materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)]
    const k = kCargaDia(unidad.grupoId, dia)
    leccionesPorDiaGrupo[k] = Math.max(0, (leccionesPorDiaGrupo[k] || 0) - bloquesAOcupar.length)
  }

  function puntajeBloque(unidad, bloque) {
    let puntaje = 0
    if (unidad.bloquesPreferidos.includes(bloque.id)) puntaje += 10
    if (unidad.bloquesEvitados.includes(bloque.id)) puntaje -= 10
    return puntaje
  }

  // Para una unidad SUELTA: probamos cada (día, bloque) libre, priorizando
  // preferencias del profesor y, si el modo es 'parejo', priorizando días
  // con menos carga ya asignada a ese grupo.
  function opcionesSuelta(unidad) {
    const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
    const opciones = []
    for (const dia of diasDisponibles) {
      for (const bloque of bloquesClase) {
        let puntaje = puntajeBloque(unidad, bloque)
        const carga = leccionesPorDiaGrupo[kCargaDia(unidad.grupoId, dia)] || 0
        if (modoReparto === 'parejo') {
          puntaje -= carga // preferir días con MENOS carga acumulada -> reparte parejo
        } else if (modoReparto === 'temprano') {
          puntaje += carga // preferir días con MÁS carga acumulada -> concentra, deja otros días libres
        }
        opciones.push({ dia, bloques: [bloque], puntaje })
      }
    }
    opciones.sort((a, b) => b.puntaje - a.puntaje)
    return opciones
  }

  // Para una unidad DOBLE: probamos cada par de bloques consecutivos en
  // cada día, sumando el puntaje de ambos bloques.
  function opcionesDoble(unidad) {
    const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
    const opciones = []
    for (const dia of diasDisponibles) {
      for (const [b1, b2] of paresConsecutivos) {
        let puntaje = puntajeBloque(unidad, b1) + puntajeBloque(unidad, b2)
        const carga = leccionesPorDiaGrupo[kCargaDia(unidad.grupoId, dia)] || 0
        if (modoReparto === 'parejo') {
          puntaje -= carga
        } else if (modoReparto === 'temprano') {
          puntaje += carga
        }
        opciones.push({ dia, bloques: [b1, b2], puntaje })
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
    const opciones = unidad.tipo === 'doble' ? opcionesDoble(unidad) : opcionesSuelta(unidad)

    // Primera pasada: sin permitir que la materia se repita el mismo día
    // (salvo que sea la propia unidad doble, que ocupa 2 bloques del mismo
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
      conflictos.push({
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        motivo: unidad.tipo === 'doble'
          ? 'No se encontró un bloque doble (2 lecciones seguidas) libre sin choques.'
          : 'No se encontró un bloque libre sin choques.',
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
