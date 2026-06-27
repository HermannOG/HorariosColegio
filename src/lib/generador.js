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
// 6. REGLA DURA — "nunca se sale antes del almuerzo": cada grupo, cada
//    día, debe tener clase ocupada al menos hasta el último bloque antes
//    del almuerzo (no puede "terminar" su jornada más temprano que eso).
//    No es obligatorio CRUZAR el almuerzo, solo llegar hasta el bloque
//    justo anterior. Esto se aplica en la fase de compactación (ver
//    `compactarHuecos`): el tramo objetivo de cada grupo+día nunca es
//    más corto que ese mínimo, aunque eso signifique reportar un hueco
//    sin reparar si no hay suficientes lecciones ese día para llenarlo.
// 7. AYUDA CRUZADA entre grupos al compactar huecos: si, para cerrar un
//    hueco de un grupo, la única lección disponible para ese hueco tiene
//    a su profesor ocupado en OTRO grupo a esa misma hora, antes de
//    rendirse se intenta reacomodar esa clase del otro grupo (con su
//    propio backtracking independiente) para liberar el bloque. Si esa
//    ayuda no se termina usando (el camino que la motivó se descarta más
//    adelante), se revierte por completo — nunca queda un cambio a medio
//    aplicar ni se empeora un grupo que ya estaba bien.
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
export function construirTramosConsecutivos(bloquesTodos, tamano, permitirAtravesarRecreos = false, puedeAtravesarAlmuerzo = false) {
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

// Encuentra, dentro de la grilla completa de bloques (clase/recreo/
// almuerzo, en orden), el índice del ÚLTIMO bloque de tipo 'clase' que
// queda ANTES del primer bloque de tipo 'almuerzo'. Ese bloque es el
// "mínimo de salida": ningún grupo puede terminar su jornada de un día
// antes de llegar ahí (no es obligatorio cruzar el almuerzo, pero sí
// llegar justo hasta el límite anterior). Si no hay almuerzo definido en
// la grilla, no hay mínimo que aplicar (devuelve -1, "sin restricción").
function indiceUltimoBloqueClaseAntesDelAlmuerzo(bloquesTodos) {
  const indiceAlmuerzo = bloquesTodos.findIndex(b => b.tipo === 'almuerzo')
  if (indiceAlmuerzo === -1) return -1
  for (let i = indiceAlmuerzo - 1; i >= 0; i--) {
    if (bloquesTodos[i].tipo === 'clase') return i
  }
  return -1
}

function calcularDisponibilidad(unidad, dias, bloquesClase) {
  const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
  return diasDisponibles.length * bloquesClase.length
}

function generarUnIntento({ profesores, dias, bloques, modoReparto, azar }) {
  const bloquesClase = bloques.filter(b => b.tipo === 'clase')

  // Posición (dentro de bloquesClase, no de bloques) del último bloque de
  // clase antes del almuerzo — el mínimo de lecciones que cada grupo debe
  // tener ese día para no "salir antes del almuerzo". Por ejemplo, si el
  // almuerzo viene después del bloque 6° (índice 5 en bloquesClase, 0-based),
  // el mínimo de lecciones por día por grupo es 6.
  const indiceMinimoEnGrilla = indiceUltimoBloqueClaseAntesDelAlmuerzo(bloques)
  const minimoLeccionesPorDia = indiceMinimoEnGrilla === -1
    ? 0
    : bloquesClase.findIndex(b => b.id === bloques[indiceMinimoEnGrilla].id) + 1

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

  // Ordenar: las unidades 'continua' SIEMPRE van primero, sin excepción
  // (restricción estructural, nunca se mezcla). Dentro de cada grupo
  // (continua vs. no-continua), ordenamos por disponibilidad real del
  // profesor (menos días libres primero), y dentro de ESO, agregamos un
  // desempate ALEATORIO (controlado por `azar`) en lugar de uno fijo —
  // esto permite que generarHorario() pruebe varios órdenes distintos en
  // sucesivos intentos y se quede con el que dé mejor resultado, en vez
  // de repetir siempre la misma distribución determinística.
  unidades = unidades
    .map(u => ({ ...u, disponibilidad: calcularDisponibilidad(u, dias, bloquesClase), _azar: azar() }))
    .sort((a, b) => {
      const aEsContinua = a.tipo === 'continua'
      const bEsContinua = b.tipo === 'continua'
      if (aEsContinua !== bEsContinua) return aEsContinua ? -1 : 1
      if (a.disponibilidad !== b.disponibilidad) return a.disponibilidad - b.disponibilidad
      if (a.cantidadBloques !== b.cantidadBloques) return b.cantidadBloques - a.cantidadBloques
      return a._azar - b._azar
    })

  const ocupacionProfesor = {}  // `${profId}|${dia}|${bloqueId}` -> true
  const ocupacionGrupo = {}     // `${grupoId}|${dia}|${bloqueId}` -> true
  const materiaGrupoDia = {}    // `${grupoId}|${materiaId}|${dia}` -> true
  const leccionesPorDiaGrupo = {} // `${grupoId}|${dia}` -> cantidad de lecciones ese día

  const asignaciones = []
  const conflictos = []

  // ----------------------------------------------------------------------
  // Para que el modo 'temprano' pueda concentrar carga sin terminar
  // dejando algún día por debajo de `minimoLeccionesPorDia`, hay que saber,
  // en todo momento, cuántas lecciones le quedan por colocar a cada grupo
  // en TOTAL (sumando todos los días). Si un grupo ya tiene poco margen
  // restante, no se le puede permitir seguir "apilando" lecciones en los
  // días que ya superaron el mínimo, porque eso le quitaría a los días que
  // todavía no llegan la posibilidad de alcanzarlo.
  //
  // `leccionesPendientesPorGrupo` arranca en el total de lecciones de cada
  // grupo (suma de leccionesPorSemana de todas sus asignaciones) y baja a
  // medida que se van colocando unidades.
  const leccionesPendientesPorGrupo = {}
  if (minimoLeccionesPorDia > 0) {
    for (const prof of profesores) {
      for (const asig of (prof.asignaciones || [])) {
        const cantidad = Number(asig.leccionesPorSemana) || 0
        leccionesPendientesPorGrupo[asig.grupoId] = (leccionesPendientesPorGrupo[asig.grupoId] || 0) + cantidad
      }
    }
  }

  // ¿Es seguro agregar `cantidadAOcupar` lecciones más al día `dia` del
  // grupo `grupoId`, sin arriesgar que algún OTRO día se quede sin
  // alcanzar el mínimo por falta de lecciones disponibles? Solo se aplica
  // cuando el día en cuestión YA alcanzó el mínimo (si todavía no lo
  // alcanzó, siempre es seguro seguir completándolo).
  function esSeguroConcentrarEnEsteDia(grupoId, dia, cantidadAOcupar) {
    if (minimoLeccionesPorDia <= 0) return true
    const cargaActual = leccionesPorDiaGrupo[kCargaDia(grupoId, dia)] || 0
    if (cargaActual < minimoLeccionesPorDia) return true // este día aún no llegó al mínimo, no hay riesgo

    const pendientesAntes = leccionesPendientesPorGrupo[grupoId] || 0
    const pendientesDespues = pendientesAntes - cantidadAOcupar
    // Cuántas lecciones harían falta, como mínimo, para que TODOS los días
    // que aún no llegaron al mínimo (sin contar el día actual, que ya lo
    // superó) lo alcancen.
    let necesarioParaElResto = 0
    for (const d of dias) {
      if (d === dia) continue
      const carga = leccionesPorDiaGrupo[kCargaDia(grupoId, d)] || 0
      if (carga < minimoLeccionesPorDia) necesarioParaElResto += (minimoLeccionesPorDia - carga)
    }
    return pendientesDespues >= necesarioParaElResto
  }

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
        _unidadTipo: unidad.tipo,
        _unidadPuedeAtravesarAlmuerzo: !!unidad.puedeAtravesarAlmuerzo,
      })
    }
    materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)] = true
    const k = kCargaDia(unidad.grupoId, dia)
    leccionesPorDiaGrupo[k] = (leccionesPorDiaGrupo[k] || 0) + bloquesAOcupar.length
    if (minimoLeccionesPorDia > 0 && unidad.grupoId in leccionesPendientesPorGrupo) {
      leccionesPendientesPorGrupo[unidad.grupoId] -= bloquesAOcupar.length
    }
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
  //
  // El modo 'temprano' concentra carga en los días que YA tienen más
  // lecciones puestas, para que otros días salgan más temprano — pero
  // nunca a costa de dejar un día por debajo de `minimoLeccionesPorDia`
  // (la regla dura de "nunca se sale antes del almuerzo" se resuelve de
  // forma definitiva en la fase de compactación; acá solo evitamos que
  // el desempate por puntaje empuje activamente en la dirección
  // contraria a esa regla).
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
          // Preferir días con MÁS carga acumulada (concentra), pero solo
          // mientras ese día ya vaya camino a alcanzar el mínimo exigido.
          // Si un día todavía no llega al mínimo, no tiene sentido
          // "premiarlo" más que a otro: hay que seguir completándolo
          // igual que en modo parejo, para no terminar saliendo temprano.
          if (minimoLeccionesPorDia > 0 && carga < minimoLeccionesPorDia) {
            puntaje -= carga // mismo criterio que 'parejo' hasta llegar al mínimo
          } else {
            puntaje += carga // ya alcanzó el mínimo: ahora sí se puede concentrar
          }
        }
        opciones.push({ dia, bloques: tramo, puntaje, _azar: azar() })
      }
    }
    opciones.sort((a, b) => (b.puntaje - a.puntaje) || (a._azar - b._azar))
    return opciones
  }

  function cabeSinChoque(unidad, dia, bloquesAOcupar, permitirRepetirMateriaDia, respetarTopeConcentracion) {
    for (const bloque of bloquesAOcupar) {
      if (ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)]) return false
      if (ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)]) return false
    }
    if (!permitirRepetirMateriaDia && materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)]) return false
    if (respetarTopeConcentracion && !esSeguroConcentrarEnEsteDia(unidad.grupoId, dia, bloquesAOcupar.length)) return false
    return true
  }

  function intentarUnidad(unidad) {
    const opciones = opcionesParaUnidad(unidad)

    // Tres pasadas, de más estricta a más permisiva — nunca se reporta un
    // conflicto si existe CUALQUIER lugar donde la unidad físicamente
    // cabe sin choque de profesor/grupo:
    //   1) sin repetir materia el mismo día + respetando el tope de
    //      concentración (no le "robar" margen a otro día para llegar al
    //      mínimo de salida antes del almuerzo) — el caso ideal.
    //   2) permitiendo repetir materia el mismo día (igual que antes),
    //      pero todavía respetando el tope de concentración.
    //   3) sin respetar el tope de concentración — última instancia, solo
    //      si las dos anteriores no encontraron ningún lugar. Esto evita
    //      que la nueva regla genere conflictos artificiales: prioriza el
    //      reparto seguro, pero nunca bloquea una colocación que de otro
    //      modo sería válida. Si esto ocurre, puede que algún día quede
    //      corto de margen — eso se detecta y reporta en la fase de
    //      compactación (salidaTemprana), no se pierde de vista.
    for (const [permitirRepetir, respetarTope] of [[false, true], [true, true], [true, false]]) {
      for (const { dia, bloques: bloquesOpcion } of opciones) {
        if (cabeSinChoque(unidad, dia, bloquesOpcion, permitirRepetir, respetarTope)) {
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
  // clase del día (puede terminar antes, pero nunca con un hueco en medio),
  // Y ADEMÁS ese tramo nunca puede ser más corto que `minimoLeccionesPorDia`
  // (regla dura: "nunca se sale antes del almuerzo" — el día siempre debe
  // llegar, como mínimo, hasta el último bloque de clase anterior al
  // almuerzo). El generador de arriba no garantiza ninguna de las dos cosas
  // por sí solo, porque distintas materias se van colocando una por una sin
  // coordinarse entre sí. Acá reparamos cualquier hueco que haya quedado,
  // moviendo lecciones hacia atrás. Un movimiento solo es válido si el
  // profesor de esa lección sigue libre en el nuevo horario (no puede
  // chocar con otra clase que ya tenga en otro grupo a esa hora). Si mover
  // una lección directamente no es posible, se intenta encadenar con otras
  // lecciones del mismo grupo+día que sí puedan moverse, antes de rendirse
  // y dejar el hueco (que se reporta como advertencia). Si el grupo
  // simplemente no tiene suficientes lecciones ese día para alcanzar el
  // mínimo exigido, el hueco al final del día tampoco se puede cerrar —
  // se reporta como conflicto explicado en vez de dejarlo pasar en silencio.
  const huecosNoReparables = compactarHuecos({
    bloques, bloquesClase, dias, grupos: [...new Set(unidades.map(u => u.grupoId))],
    asignaciones, ocupacionProfesor, ocupacionGrupo, minimoLeccionesPorDia,
  })
  for (const h of huecosNoReparables) {
    const motivo = h.tipo === 'salidaTemprana'
      ? `el día ${h.dia} este grupo solo tiene ${h.leccionesReales} lección(es) y no llega hasta el bloque previo al almuerzo (mínimo ${h.minimoExigido}) — saldría antes de tiempo.`
      : `quedó un hueco sin clase el día ${h.dia} (lección ${h.bloqueNumero || h.bloqueId}) que no se pudo cerrar sin generar un choque de profesor.`
    conflictos.push({
      profesorId: null,
      profesorNombre: null,
      grupoId: h.grupoId,
      materiaId: null,
      motivo,
    })
  }

  // Limpiar campos internos que solo se usaron para la compactación —
  // no deben quedar en el resultado final que se guarda/muestra.
  const asignacionesLimpias = asignaciones.map(({ _unidadTipo, _unidadPuedeAtravesarAlmuerzo, ...resto }) => resto)

  return {
    asignaciones: asignacionesLimpias,
    conflictos,
    generadoEn: new Date().toISOString(),
    completo: conflictos.length === 0,
  }
}

// Generador de números pseudoaleatorios con semilla, para que cada intento
// sea reproducible si se necesita depurar, pero distinto entre sí.
function crearAzar(semilla) {
  let estado = semilla
  return function azar() {
    estado = (estado * 1103515245 + 12345) & 0x7fffffff
    return estado / 0x7fffffff
  }
}

// ========================================================================
// Punto de entrada público. En vez de quedarse con el primer resultado que
// encuentra, corre varios intentos completos (generación + compactación),
// cada uno con un orden de colocación ligeramente distinto (aleatorización
// controlada en los desempates, sin tocar las restricciones duras), y se
// queda con el MEJOR resultado: el que tenga menos conflictos totales, y
// entre empates, el que tenga menos huecos de grupo sin reparar.
//
// Esto es deliberadamente más lento que generar una sola vez, a cambio de
// encontrar más a menudo una solución completa o, si no existe, la que
// deje la menor cantidad de problemas pendientes — tal como se pidió:
// priorizar la robustez del resultado por sobre la velocidad.
// ========================================================================
export function generarHorario({ profesores, dias, bloques, modoReparto = 'parejo', intentos = 40 }) {
  let mejorResultado = null
  let mejorPuntaje = Infinity

  for (let i = 0; i < intentos; i++) {
    const azar = crearAzar(i * 2654435761 + 1)
    const resultado = generarUnIntento({ profesores, dias, bloques, modoReparto, azar })

    // Puntaje del intento: cada conflicto "normal" (lección sin ubicar)
    // pesa 1, pero un hueco de grupo sin reparar (incluida una salida
    // temprana antes del almuerzo) pesa más, porque rompe una regla
    // estructural más visible/grave que una lección puntual.
    const huecos = resultado.conflictos.filter(c => !c.profesorId).length
    const otros = resultado.conflictos.length - huecos
    const puntaje = huecos * 3 + otros

    if (puntaje < mejorPuntaje) {
      mejorPuntaje = puntaje
      mejorResultado = resultado
    }

    if (puntaje === 0) break // ya es perfecto, no hace falta seguir probando
  }

  return mejorResultado
}

// Recorre cada grupo y cada día, y busca un REORDENAMIENTO válido de las
// lecciones de ese día tal que no quede ningún hueco en medio — ocupando
// exactamente los primeros N bloques de clase del día, EN UN ORDEN QUE
// SOLO USE POSICIONES REALMENTE VÁLIDAS PARA CADA UNIDAD, Y CON N NUNCA
// MENOR QUE `minimoLeccionesPorDia` (mínimo para no salir antes del
// almuerzo).
//
// Esto es clave: una unidad doble normal (ej. Educación Física, 2
// lecciones) solo puede ocupar 2 bloques de clase que sean estrictamente
// consecutivos EN LA GRILLA REAL (sin un recreo de por medio) — nunca se
// le permite "saltar" un recreo, a diferencia de una unidad continua (ej.
// Tecnología), que sí puede atravesar recreos y, si está habilitado,
// también el almuerzo. Si no se respeta esto, se puede terminar con un
// par roto por un recreo en medio, que es exactamente el bug que se debía
// evitar.
//
// Primero se agrupan las asignaciones en "unidades móviles" (reconstruye
// los bloques dobles/continuos ya colocados en la fase 1, junto con su
// tipo original). Después, mediante backtracking, se prueba ubicar cada
// unidad pendiente en alguno de los TRAMOS VÁLIDOS de la grilla (no
// cualquier rango de índices), de forma que el conjunto ocupe exactamente
// los primeros N bloques de clase del día sin huecos, donde N es el MAYOR
// entre la cantidad real de lecciones del día y el mínimo exigido — si el
// grupo no tiene suficientes lecciones para llegar al mínimo, el "hueco"
// que queda entre la última lección real y el mínimo se reporta como
// salida temprana, no se inventa una clase para llenarlo.
// ========================================================================
// COMPACTACIÓN DE HUECOS — con ayuda cruzada AISLADA entre grupos.
// ------------------------------------------------------------------------
// El backtracking principal sigue siendo, como siempre, INDEPENDIENTE por
// grupo+día — esto es deliberado y crítico: un backtracking único que
// intente resolver varios grupos a la vez puede, al fallar para uno de
// ellos (por ejemplo porque ese grupo genuinamente no tiene margen),
// retroceder y deshacer soluciones que YA estaban bien en otro grupo,
// dejándolo peor de lo que estaba. Esa fue una primera implementación que
// se probó y se descartó por ese motivo exacto.
//
// En cambio, cuando el backtracking de UN grupo encuentra que el tramo que
// necesita está ocupado por el mismo profesor en OTRO grupo, intenta —
// como un paso adicional, antes de descartar esa opción— "pedir ayuda":
// ejecuta un backtracking SEPARADO e INDEPENDIENTE sobre ese otro grupo,
// para ver si esa lección puntual se puede reubicar dentro de su propio
// día sin generar un hueco. Si la ayuda tiene éxito, el cambio en el otro
// grupo se aplica de forma permanente ahí mismo (no depende de que el
// grupo que pidió ayuda termine teniendo éxito) — porque ese movimiento,
// por sí solo, deja al otro grupo igual de compacto que antes, solo en
// otra posición; no hay motivo para revertirlo después. Si la ayuda
// falla, se descarta sin tocar nada y se sigue probando como si esa
// opción no hubiera existido — el grupo ayudante nunca queda peor.
// ========================================================================

function compactarHuecos({ bloques, bloquesClase, dias, grupos, asignaciones, ocupacionProfesor, ocupacionGrupo, minimoLeccionesPorDia = 0 }) {
  function kProf(profId, dia, bloqueId) { return `${profId}|${dia}|${bloqueId}` }
  function kGrupo(grupoId, dia, bloqueId) { return `${grupoId}|${dia}|${bloqueId}` }

  // Cache de tramos válidos por (tamaño, tipo) para no recalcular.
  const tramosCache = {}
  function tramosValidosPara(tamano, esContinua, puedeAtravesarAlmuerzo) {
    const clave = `${tamano}|${esContinua}|${puedeAtravesarAlmuerzo}`
    if (!tramosCache[clave]) {
      tramosCache[clave] = construirTramosConsecutivos(bloques, tamano, esContinua, puedeAtravesarAlmuerzo)
    }
    return tramosCache[clave]
  }

  const huecosNoReparables = []

  // Agrupa las asignaciones de un grupo+día en unidades móviles: tramos de
  // lecciones consecutivas (según el orden real de bloquesClase) que
  // comparten profesor+materia+grupo. Conserva el tipo original (doble,
  // suelta, continua) y si puede atravesar almuerzo, para saber en qué
  // tramos puede reubicarse.
  function agruparEnUnidadesMoviles(asignacionesDelDia) {
    const porBloqueId = {}
    asignacionesDelDia.forEach(a => { porBloqueId[a.bloqueId] = a })

    const unidades = []
    let unidadActual = null
    for (const bloque of bloquesClase) {
      const asig = porBloqueId[bloque.id]
      if (!asig) { unidadActual = null; continue }
      const mismaUnidad = unidadActual
        && unidadActual.profesorId === asig.profesorId
        && unidadActual.materiaId === asig.materiaId
        && unidadActual.grupoId === asig.grupoId
        && unidadActual.esContinua === (asig._unidadTipo === 'continua')
      if (mismaUnidad) {
        unidadActual.asignacionesOrdenadas.push(asig)
        unidadActual.tamano++
      } else {
        unidadActual = {
          profesorId: asig.profesorId,
          materiaId: asig.materiaId,
          grupoId: asig.grupoId,
          tamano: 1,
          esContinua: asig._unidadTipo === 'continua',
          puedeAtravesarAlmuerzo: !!asig._unidadPuedeAtravesarAlmuerzo,
          asignacionesOrdenadas: [asig],
        }
        unidades.push(unidadActual)
      }
    }
    return unidades
  }

  // Identifica, para un profesor y un bloqueId en un día dado, a qué grupo
  // pertenece la clase que lo está ocupando AHORA MISMO (mirando el estado
  // real y actual de `asignaciones`, que para el momento en que se llama
  // esta función ya refleja cualquier compactación previa de otros
  // grupos+días, porque la función avanza grupo por grupo, día por día,
  // siempre sobre el array real).
  function encontrarGrupoOcupante(profesorId, dia, bloqueId) {
    const hit = asignaciones.find(a => a.profesorId === profesorId && a.dia === dia && a.bloqueId === bloqueId)
    return hit ? hit.grupoId : null
  }

  const PROFUNDIDAD_MAXIMA_AYUDA = 2
  let ayudasIntentadas = 0
  const TOPE_AYUDAS = 5000 // límite de seguridad para no descontrolar el tiempo de cómputo

  // Intenta compactar el grupo+día indicado, exactamente con la misma
  // lógica de backtracking que existía antes (independiente, nunca
  // acoplada a otros grupos). La única diferencia respecto a la versión
  // original es que, cuando una unidad no puede colocarse porque su
  // profesor está ocupado en OTRO grupo a esa hora, antes de descartar esa
  // opción se intenta `pedirAyuda` para liberar ese bloque en el otro
  // grupo. Devuelve `true`/`false` igual que antes.
  function compactarGrupoDia(grupoId, dia, asignacionesDelDia, objetivoEfectivo) {
    const unidadesMoviles = agruparEnUnidadesMoviles(asignacionesDelDia)
    const idsObjetivoEfectivo = objetivoEfectivo.map(b => b.id)

    function tramosDentroDelObjetivo(unidad) {
      const todos = tramosValidosPara(unidad.tamano, unidad.esContinua, unidad.puedeAtravesarAlmuerzo)
      return todos.filter(tramo => tramo.every(b => idsObjetivoEfectivo.includes(b.id)))
    }

    // Liberamos temporalmente la ocupación de este grupo+día.
    for (const a of asignacionesDelDia) {
      delete ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)]
      delete ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)]
    }

    const pendientes = [...unidadesMoviles]
    const asignacionTramo = {}
    const ocupadoLocal = new Set()

    // Intenta resolver, mediante un backtracking SEPARADO e
    // INDEPENDIENTE, un único bloqueo puntual: la clase del
    // `profesorBloqueante` que ocupa `bloqueId` en `grupoOcupante`, ese
    // mismo día. Si logra reubicarla (junto con cualquier otra unidad de
    // ese grupo que haga falta reacomodar) dentro de su propio grupo+día
    // sin generar un hueco nuevo, aplica el cambio de inmediato y devuelve
    // un objeto `{ exito, deshacer }` — el llamador es responsable de
    // invocar `deshacer()` si más adelante decide no usar este camino.
    //
    // A diferencia de un simple "mover esa unidad a otro
    // lado" (que falla en casos donde liberar esa posición requiere
    // reacomodar VARIAS unidades de ese grupo a la vez, no solo una), esta
    // función ejecuta un backtracking COMPLETO e INDEPENDIENTE sobre todo
    // el día de `grupoOcupante`, con la única restricción extra de que el
    // profesor bloqueante no puede usar `bloqueId`. Si encuentra un
    // reordenamiento completo y compacto (sin huecos) que respeta esa
    // restricción, lo aplica de inmediato y de forma permanente. Si no,
    // no toca nada y devuelve `false`.
    function pedirAyuda(grupoOcupante, bloqueId, profesorBloqueante, profundidadRestante) {
      if (profundidadRestante <= 0) return false
      ayudasIntentadas++
      if (ayudasIntentadas > TOPE_AYUDAS) return false

      const asignacionesOcupante = asignaciones.filter(a => a.grupoId === grupoOcupante && a.dia === dia)
      if (asignacionesOcupante.length === 0) return false

      const cantidadRealOcupante = asignacionesOcupante.length
      const cantidadObjetivoOcupante = Math.max(cantidadRealOcupante, minimoLeccionesPorDia)
      const hayFaltanteOcupante = cantidadObjetivoOcupante > cantidadRealOcupante
      const objetivoOcupante = hayFaltanteOcupante
        ? bloquesClase.slice(0, cantidadRealOcupante)
        : bloquesClase.slice(0, cantidadObjetivoOcupante)
      const idsObjetivoOcupante = new Set(objetivoOcupante.map(b => b.id))

      const unidadesOcupante = agruparEnUnidadesMoviles(asignacionesOcupante)

      // Liberamos temporalmente la ocupación de este grupo+día (igual que
      // hace `compactarGrupoDia`), para poder probar reordenamientos.
      for (const a of asignacionesOcupante) {
        delete ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)]
        delete ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)]
      }

      const pendientesOcupante = [...unidadesOcupante]
      const asignacionTramoOcupante = {}
      const ocupadoLocalOcupante = new Set()

      function tramosDentroDelObjetivoOcupante(unidad) {
        const todos = tramosValidosPara(unidad.tamano, unidad.esContinua, unidad.puedeAtravesarAlmuerzo)
        return todos.filter(tramo => tramo.every(b => idsObjetivoOcupante.has(b.id)))
      }

      function backtrackOcupante() {
        const primerLibre = objetivoOcupante.find(b => !ocupadoLocalOcupante.has(b.id))
        if (!primerLibre) return true

        for (let i = 0; i < pendientesOcupante.length; i++) {
          const unidad = pendientesOcupante[i]
          if (!unidad) continue

          const tramos = tramosDentroDelObjetivoOcupante(unidad)
          for (const tramo of tramos) {
            if (tramo[0].id !== primerLibre.id) continue
            if (tramo.some(b => ocupadoLocalOcupante.has(b.id))) continue

            // Restricción extra: el profesor bloqueante no puede usar el
            // bloque que necesita liberar para el grupo que pidió ayuda.
            if (unidad.profesorId === profesorBloqueante && tramo.some(b => b.id === bloqueId)) continue

            const claves = tramo.map(b => kProf(unidad.profesorId, dia, b.id))
            // No se permite cascada de 2º nivel dentro de esta sub-búsqueda
            // (mantenemos la recursión de ayuda acotada y predecible): si
            // el tramo choca con otro grupo, simplemente se descarta como
            // opción aquí, igual que el backtracking original siempre hizo
            // antes de esta mejora.
            if (claves.some(k => ocupacionProfesor[k])) continue

            claves.forEach(k => { ocupacionProfesor[k] = true })
            tramo.forEach(b => ocupadoLocalOcupante.add(b.id))
            asignacionTramoOcupante[primerLibre.id] = { unidad, bloquesDestino: tramo }
            pendientesOcupante[i] = null

            if (backtrackOcupante()) return true

            claves.forEach(k => { delete ocupacionProfesor[k] })
            tramo.forEach(b => ocupadoLocalOcupante.delete(b.id))
            delete asignacionTramoOcupante[primerLibre.id]
            pendientesOcupante[i] = unidad
          }
        }
        return false
      }

      const exitoOcupante = backtrackOcupante()

      if (exitoOcupante) {
        // Guardamos el estado ORIGINAL (antes de este cambio) para poder
        // deshacerlo si el backtracking del grupo que pidió ayuda termina
        // retrocediendo más allá de este punto.
        const estadoOriginal = asignacionesOcupante.map(a => ({ asig: a, bloqueIdOriginal: a.bloqueId }))

        for (const entrada of Object.values(asignacionTramoOcupante)) {
          const { unidad, bloquesDestino } = entrada
          unidad.asignacionesOrdenadas.forEach((asig, k) => {
            asig.bloqueId = bloquesDestino[k].id
          })
          bloquesDestino.forEach(b => {
            ocupacionGrupo[kGrupo(grupoOcupante, dia, b.id)] = true
          })
        }

        return {
          exito: true,
          deshacer: () => {
            // Revertir ocupacionGrupo y ocupacionProfesor a lo que estaba
            // antes de este cambio puntual, y restaurar bloqueId original.
            for (const a of asignacionesOcupante) {
              delete ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)]
              delete ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)]
            }
            for (const { asig, bloqueIdOriginal } of estadoOriginal) {
              asig.bloqueId = bloqueIdOriginal
            }
            for (const a of asignacionesOcupante) {
              ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)] = true
              ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)] = true
            }
          },
        }
      }

      // No se encontró reordenamiento válido: restaurar todo a su estado
      // original antes de devolver false, para no dejar nada corrupto.
      for (const a of asignacionesOcupante) {
        ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)] = true
        ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)] = true
      }
      return false
    }

    // NOTA sobre las "ayudas aplicadas": una primera versión de este
    // mecanismo dejaba las ayudas exitosas aplicadas de forma permanente,
    // asumiendo que una ayuda exitosa nunca podía perjudicar a nadie (deja
    // al grupo ayudante igual de compacto, solo en otra posición). Las
    // pruebas mostraron que esa suposición era incorrecta: aunque el grupo
    // ayudante queda bien, la ayuda puede consumir un recurso (cierto
    // profesor libre en cierto bloque) que el propio backtracking del
    // grupo que pidió ayuda necesitaba para una opción DISTINTA, más
    // adelante en su búsqueda. Por eso cada ayuda ahora se deshace si el
    // intento puntual que la motivó termina retrocediendo (ver
    // `ayudasDeEsteIntento` más abajo) — la ayuda es tan reversible como
    // cualquier otro paso del backtracking.

    function backtrack() {
      const primerLibre = objetivoEfectivo.find(b => !ocupadoLocal.has(b.id))
      if (!primerLibre) return true

      for (let i = 0; i < pendientes.length; i++) {
        const unidad = pendientes[i]
        if (!unidad) continue

        const tramos = tramosDentroDelObjetivo(unidad)
        for (const tramo of tramos) {
          if (tramo[0].id !== primerLibre.id) continue
          if (tramo.some(b => ocupadoLocal.has(b.id))) continue

          const claves = tramo.map(b => kProf(unidad.profesorId, dia, b.id))
          const bloqueado = claves.some(k => ocupacionProfesor[k])

          const ayudasDeEsteIntento = []
          let viable = true

          if (bloqueado) {
            // Antes de descartar esta opción, intentamos pedir ayuda para
            // cada bloque bloqueado por otro grupo. Cada ayuda exitosa se
            // registra en `ayudasDeEsteIntento` para poder deshacerla si
            // este intento puntual termina retrocediendo.
            for (const bloque of tramo) {
              const clave = kProf(unidad.profesorId, dia, bloque.id)
              if (!ocupacionProfesor[clave]) continue
              const otroGrupo = encontrarGrupoOcupante(unidad.profesorId, dia, bloque.id)
              if (!otroGrupo || otroGrupo === grupoId) { viable = false; break }
              const resultadoAyuda = pedirAyuda(otroGrupo, bloque.id, unidad.profesorId, PROFUNDIDAD_MAXIMA_AYUDA)
              if (!resultadoAyuda) { viable = false; break }
              ayudasDeEsteIntento.push(resultadoAyuda)
            }
            if (!viable) {
              // Deshacer cualquier ayuda que sí se haya aplicado en este
              // intento puntual antes de descartarlo — no queremos dejar
              // cambios a medio aplicar si este camino no se usa.
              ayudasDeEsteIntento.forEach(a => a.deshacer())
              continue
            }
            // Todos los bloqueos se resolvieron: re-chequeamos antes de colocar.
            if (claves.some(k => ocupacionProfesor[k])) {
              ayudasDeEsteIntento.forEach(a => a.deshacer())
              continue // por seguridad, no debería pasar
            }
          }

          claves.forEach(k => { ocupacionProfesor[k] = true })
          tramo.forEach(b => ocupadoLocal.add(b.id))
          asignacionTramo[primerLibre.id] = { unidad, bloquesDestino: tramo }
          pendientes[i] = null

          if (backtrack()) return true

          // deshacer: tanto lo de este grupo como cualquier ayuda externa
          // que se haya aplicado específicamente para este intento puntual
          // — si este camino no llevó a una solución completa, no debe
          // quedar ningún cambio externo colgando.
          claves.forEach(k => { delete ocupacionProfesor[k] })
          tramo.forEach(b => ocupadoLocal.delete(b.id))
          delete asignacionTramo[primerLibre.id]
          pendientes[i] = unidad
          ayudasDeEsteIntento.forEach(a => a.deshacer())
        }
      }
      return false
    }

    const exito = backtrack()

    if (exito) {
      for (const entrada of Object.values(asignacionTramo)) {
        const { unidad, bloquesDestino } = entrada
        unidad.asignacionesOrdenadas.forEach((asig, k) => {
          asig.bloqueId = bloquesDestino[k].id
        })
        bloquesDestino.forEach(b => {
          ocupacionGrupo[kGrupo(grupoId, dia, b.id)] = true
        })
      }
      return true
    } else {
      // Restaurar las posiciones originales de ESTE grupo (las ayudas
      // externas que sí tuvieron éxito durante el intento permanecen,
      // como ya se explicó).
      for (const a of asignacionesDelDia) {
        ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)] = true
        ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)] = true
      }
      return false
    }
  }

  for (const grupoId of grupos) {
    for (const dia of dias) {
      const asignacionesDelDia = asignaciones.filter(a => a.grupoId === grupoId && a.dia === dia)
      if (asignacionesDelDia.length === 0) continue

      const cantidadReal = asignacionesDelDia.length
      const cantidadObjetivo = Math.max(cantidadReal, minimoLeccionesPorDia)
      const bloquesObjetivo = bloquesClase.slice(0, cantidadObjetivo)

      const idsObjetivo = new Set(bloquesObjetivo.map(b => b.id))
      const yaCompacto = cantidadReal === cantidadObjetivo && asignacionesDelDia.every(a => idsObjetivo.has(a.bloqueId))

      const hayFaltante = cantidadObjetivo > cantidadReal
      const objetivoEfectivo = hayFaltante ? bloquesClase.slice(0, cantidadReal) : bloquesObjetivo

      if (!yaCompacto) {
        const exito = compactarGrupoDia(grupoId, dia, asignacionesDelDia, objetivoEfectivo)
        if (!exito) {
          // Re-leer las asignaciones actuales del grupo (pueden no haber
          // cambiado, ya que en fallo se restauran a su posición original).
          const actuales = asignaciones.filter(a => a.grupoId === grupoId && a.dia === dia)
          const ocupados = new Set(actuales.map(a => a.bloqueId))
          for (let i = 0; i < bloquesClase.length; i++) {
            if (ocupados.has(bloquesClase[i].id)) continue
            const hayClaseDespues = bloquesClase.slice(i + 1).some(b => ocupados.has(b.id))
            if (hayClaseDespues) {
              huecosNoReparables.push({ tipo: 'huecoIntermedio', grupoId, dia, bloqueId: bloquesClase[i].id, bloqueNumero: bloquesClase[i].numero })
              break
            }
          }
        }
      }

      // Si, además de lo anterior, no había suficientes lecciones reales
      // para llegar al mínimo exigido (sin importar si el backtracking de
      // arriba tuvo éxito o no compactando lo que sí hay), se reporta la
      // salida temprana como un problema aparte — es información distinta
      // a un hueco intermedio: acá no falta reordenar, falta CARGA.
      if (hayFaltante) {
        huecosNoReparables.push({
          tipo: 'salidaTemprana',
          grupoId,
          dia,
          leccionesReales: cantidadReal,
          minimoExigido: minimoLeccionesPorDia,
        })
      }
    }
  }

  return huecosNoReparables
}
