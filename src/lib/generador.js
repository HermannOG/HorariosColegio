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
// 8. ACTIVIDADES (no son clase a ningún grupo): un profesor puede tener
//    asignaciones de tipo "actividad" (comités, coordinaciones, etc.)
//    marcadas con `esActividad: true` y sin `grupoId`. Ocupan al
//    profesor igual que una clase normal (no puede dar clase mientras
//    hace la actividad), pero NUNCA ocupan a ningún grupo, nunca entran
//    en la regla de "no repetir esa materia/actividad el mismo día"
//    (una actividad sí puede repetirse el mismo día), y nunca participan
//    de la compactación de huecos de grupo ni de la malla curricular —
//    solo se ven en el horario "Por profesor".
// ========================================================================

function construirUnidades(profesores) {
  const unidades = []
  for (const prof of profesores) {
    const asignaciones = prof.asignaciones || []
    for (const asig of asignaciones) {
      const cantidad = Number(asig.leccionesPorSemana) || 0
      if (cantidad <= 0) continue

      const esActividad = !!asig.esActividad

      const base = {
        profesorId: prof.id,
        profesorNombre: prof.nombre,
        // Las actividades no tienen grupo: se deja sin definir (no se usa
        // en ningún choque de grupo ni de "repetir materia el mismo día").
        grupoId: esActividad ? null : asig.grupoId,
        materiaId: esActividad ? null : asig.materiaId,
        esActividad,
        actividadId: esActividad ? asig.actividadId : null,
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

function generarUnIntento({ profesores, dias, bloques, modoReparto, modoHuecosProfesor = 'normal', azar }) {
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
  // grupo (suma de leccionesPorSemana de todas sus asignaciones de CLASE —
  // las actividades no tienen grupo, así que nunca suman aquí) y baja a
  // medida que se van colocando unidades.
  const leccionesPendientesPorGrupo = {}
  if (minimoLeccionesPorDia > 0) {
    for (const prof of profesores) {
      for (const asig of (prof.asignaciones || [])) {
        if (asig.esActividad || !asig.grupoId) continue
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
    const tieneGrupo = !unidad.esActividad && !!unidad.grupoId
    for (const bloque of bloquesAOcupar) {
      ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)] = true
      if (tieneGrupo) ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)] = true
      // OJO: Firestore rechaza cualquier campo en `undefined` (setDoc
      // lanza error). Por eso acá nunca se asignan claves con `|| undefined`
      // ni `? x : undefined` — para una clase normal directamente no se
      // incluyen `esActividad`/`actividadId`, en vez de incluirlas vacías.
      const base = {
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        dia,
        bloqueId: bloque.id,
        _unidadTipo: unidad.tipo,
        _unidadPuedeAtravesarAlmuerzo: !!unidad.puedeAtravesarAlmuerzo,
      }
      if (unidad.esActividad) {
        base.esActividad = true
        base.actividadId = unidad.actividadId
      }
      asignaciones.push(base)
    }
    if (tieneGrupo) {
      materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)] = true
      const k = kCargaDia(unidad.grupoId, dia)
      leccionesPorDiaGrupo[k] = (leccionesPorDiaGrupo[k] || 0) + bloquesAOcupar.length
      if (minimoLeccionesPorDia > 0 && unidad.grupoId in leccionesPendientesPorGrupo) {
        leccionesPendientesPorGrupo[unidad.grupoId] -= bloquesAOcupar.length
      }
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
  // contraria a esa regla). Para unidades de actividad (sin grupo), no
  // hay carga de grupo que repartir ni concentrar — el desempate de
  // reparto simplemente no aplica.
  function opcionesParaUnidad(unidad) {
    const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
    const esContinua = unidad.tipo === 'continua'
    const tramos = tramosDeTamano(unidad.cantidadBloques, esContinua, esContinua && unidad.puedeAtravesarAlmuerzo)
    const tieneGrupo = !unidad.esActividad && !!unidad.grupoId
    const opciones = []
    for (const dia of diasDisponibles) {
      for (const tramo of tramos) {
        let puntaje = tramo.reduce((acc, b) => acc + puntajeBloque(unidad, b), 0)
        if (tieneGrupo) {
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
        }
        opciones.push({ dia, bloques: tramo, puntaje, _azar: azar() })
      }
    }
    opciones.sort((a, b) => (b.puntaje - a.puntaje) || (a._azar - b._azar))
    return opciones
  }

  function cabeSinChoque(unidad, dia, bloquesAOcupar, permitirRepetirMateriaDia, respetarTopeConcentracion) {
    const tieneGrupo = !unidad.esActividad && !!unidad.grupoId
    for (const bloque of bloquesAOcupar) {
      if (ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)]) return false
      if (tieneGrupo && ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)]) return false
    }
    // Las actividades nunca chocan con un grupo (no tienen) y pueden
    // repetirse el mismo día sin restricción — por eso se saltan por
    // completo el chequeo de "misma materia/grupo el mismo día" y el
    // tope de concentración (ese tope solo tiene sentido para grupos).
    if (!tieneGrupo) return true
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
    // (Para unidades de actividad, las tres pasadas dan exactamente el
    // mismo resultado, porque `cabeSinChoque` ya las deja pasar de una vez
    // — no hay necesidad de un caso especial aquí.)
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
      const conflicto = {
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        motivo: motivoPorTipo[unidad.tipo] || 'No se encontró un bloque libre sin choques.',
      }
      if (unidad.esActividad) {
        conflicto.esActividad = true
        conflicto.actividadId = unidad.actividadId
      }
      conflictos.push(conflicto)
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
  //
  // Las actividades nunca participan de esta fase: no tienen grupo, así
  // que ni `grupos` (la lista de ids reales) las incluye ni `asignaciones`
  // filtradas por grupoId las captura.
  const gruposReales = [...new Set(unidades.map(u => u.grupoId).filter(Boolean))]
  const huecosNoReparables = compactarHuecos({
    bloques, bloquesClase, dias, grupos: gruposReales,
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

  // ----------------------------------------------------------------------
  // FASE 3 — Compactar huecos de PROFESOR: igual de importante para la
  // profesora, pero menos estricta que la de grupo (esta nunca puede
  // romper la compactación de un grupo para lograrse). Se reporta en una
  // lista separada de "avisos", no como conflicto duro, porque no bloquea
  // que el horario se considere "completo" — es una mejora deseable, no
  // un requisito indispensable. Las lecciones de actividad SÍ cuentan para
  // saber si el profesor tiene un hueco entre dos compromisos suyos (están
  // en `asignaciones` con su propio bloqueId, ocupan `ocupacionProfesor`
  // igual que una clase), pero, al no tener `grupoId`, nunca se eligen
  // como "candidata a mover" hacia el hueco de otro profesor en esta fase
  // (esa función filtra por `ocupacionGrupo`, que las actividades no usan).
  const avisosHuecosProfesor = compactarHuecosProfesores({
    bloques, bloquesClase, dias, profesores, grupos: gruposReales,
    asignaciones, ocupacionProfesor, ocupacionGrupo, minimoLeccionesPorDia,
    modo: modoHuecosProfesor,
  })
  const avisos = avisosHuecosProfesor.map(a => ({
    profesorId: a.profesorId,
    profesorNombre: a.profesorNombre,
    dia: a.dia,
    bloqueNumero: a.bloqueNumero || a.bloqueId,
    motivo: `tiene un hueco sin clase el día ${a.dia} (lección ${a.bloqueNumero || a.bloqueId}) entre dos de sus clases.`,
  }))

  // Limpiar campos internos que solo se usaron para la compactación —
  // no deben quedar en el resultado final que se guarda/muestra.
  const asignacionesLimpias = asignaciones.map(({ _unidadTipo, _unidadPuedeAtravesarAlmuerzo, ...resto }) => resto)

  return {
    asignaciones: asignacionesLimpias,
    conflictos,
    avisos,
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
export function generarHorario({ profesores, dias, bloques, modoReparto = 'parejo', modoHuecosProfesor = 'normal', intentos = 40 }) {
  let mejorResultado = null
  let mejorPuntaje = Infinity

  for (let i = 0; i < intentos; i++) {
    const azar = crearAzar(i * 2654435761 + 1)
    const resultado = generarUnIntento({ profesores, dias, bloques, modoReparto, modoHuecosProfesor, azar })

    // Puntaje del intento: cada conflicto "normal" (lección sin ubicar)
    // pesa 1, pero un hueco de grupo sin reparar (incluida una salida
    // temprana antes del almuerzo) pesa más, porque rompe una regla
    // estructural más visible/grave que una lección puntual. Los avisos de
    // hueco de PROFESOR pesan muchísimo menos (0.01) — nunca deben poder
    // inclinar la balanza por encima de un solo conflicto duro; solo
    // sirven para desempatar entre intentos que ya están igual de bien en
    // todo lo demás.
    const huecos = resultado.conflictos.filter(c => !c.profesorId).length
    const otros = resultado.conflictos.length - huecos
    const puntaje = huecos * 3 + otros + resultado.avisos.length * 0.01

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
//
// Nota sobre actividades: como nunca ocupan `ocupacionGrupo` ni entran en
// `asignaciones.filter(a => a.grupoId === grupoId)` con un `grupoId` real
// (el suyo es null/undefined), son completamente invisibles para esta
// fase — ni se compactan como si fueran de un grupo, ni pueden ser
// "candidatas" para ayudar a cerrar el hueco de un grupo real. Esto es
// intencional: si se moviera una actividad para tapar un hueco, dejaría
// de cumplir su propósito de marcar al profesor como ocupado en un
// horario predecible para ese fin.
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
  //
  // Si el bloqueo lo causa una ACTIVIDAD del profesor (no otro grupo), no
  // tiene sentido pedir ayuda — la actividad no se puede mover desde acá
  // (no tiene grupo dueño); simplemente esa opción no es viable.
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
              // Si el bloqueo no pertenece a ningún grupo real (por
              // ejemplo, es una actividad del profesor, que no tiene
              // grupoId), no hay a quién pedirle ayuda: esa opción no es
              // viable, igual que si chocara contra el propio grupo.
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

// ========================================================================
// COMPACTACIÓN DE HUECOS DE PROFESOR — fase adicional, después de que los
// grupos ya quedaron compactos.
// ------------------------------------------------------------------------
// Regla pedida: un profesor no debería tener un bloque de clase libre EN
// MEDIO de su propia jornada de un día — desde la primera lección que
// tiene ese día hasta la última, no debería haber huecos (no importa qué
// grupo sea cada una). Puede entrar tarde (empezar más allá del bloque 1)
// o salir temprano (terminar antes del último bloque) sin ningún
// problema — lo único que se evita es un hueco EN MEDIO de su propio
// rango ocupado ese día. A diferencia de la regla de huecos de GRUPO,
// esta es más blanda: el generador la intenta, pero si no se puede
// resolver sin romper algo más importante (un hueco de grupo, un choque
// de profesor), se deja así y se informa como AVISO, no como conflicto.
//
// Por eso esta fase corre DESPUÉS de `compactarHuecos` (grupos), nunca
// antes, y cualquier movimiento que proponga para cerrar el hueco de un
// profesor se descarta si dejaría a algún grupo con un hueco nuevo — la
// regla de grupo manda siempre.
//
// Dos modos, controlados por `modo` ('normal' | 'estricto'):
//   - 'normal' (comportamiento histórico, sin cambios): por cada hueco,
//     se intenta mover UNA lección suelta del mismo profesor (de
//     cualquier otro momento de ese día) hacia el bloque vacío. Si no
//     hay ninguna lección suelta que pueda moverse ahí sin romper la
//     compactación de su grupo, el hueco queda como aviso.
//   - 'estricto': además de lo anterior, si mover-a-vacío no funciona
//     (lo más común, porque un grupo ya compacto no suele tener bloques
//     vacíos disponibles), se intenta en orden:
//       1) INTERCAMBIO: la lección del profesor con hueco se intercambia
//          por la lección que YA ocupa ese bloque (de cualquier otro
//          profesor). Si ese otro profesor queda con un hueco nuevo por
//          el intercambio, se intenta resolver también en CASCADA
//          (recursiva, con límite de profundidad) — el mismo principio
//          de "ayuda reversible" ya usado para huecos de grupo
//          (pedirAyudaGrupo/deshacer): cada intento de intercambio
//          devuelve {exito, deshacer}, y si el camino que lo motivó
//          termina sin resolver el hueco original, se deshace por
//          completo antes de probar la siguiente opción.
//       2) MOVER A OTRO DÍA: como último recurso, si ningún intercambio
//          funciona, se intenta mover la lección aislada del profesor
//          con hueco a otro día de la semana donde quepa sin generar un
//          hueco nuevo (ni en su propio horario ni en el grupo al que
//          pertenece esa lección, y sin chocar con otra clase suya).
//     Si nada de esto funciona, igual que en modo normal, el hueco queda
//     como aviso — el modo estricto nunca convierte un aviso en
//     conflicto duro, solo intenta más caminos antes de rendirse.
//
// Las lecciones de actividad cuentan como "ocupado" para el profesor (ver
// `indicesOcupados` más abajo, que mira `asignaciones` sin filtrar por
// grupo) — así que un hueco entre una clase y una actividad, o entre dos
// actividades, también se detecta e intenta cerrar igual que cualquier
// otro. Lo que nunca ocurre es que una actividad sea elegida como
// "candidata a mover" ni como destino de intercambio/mover-a-otro-día
// (esa lista se restringe a candidatas con grupoId, ver `candidatasDelDia`
// más abajo), porque mover una actividad le haría perder su propósito de
// ocupar al profesor en un horario fijo y predecible.
// ========================================================================

function compactarHuecosProfesores({ bloques, bloquesClase, dias, profesores, grupos, asignaciones, ocupacionProfesor, ocupacionGrupo, minimoLeccionesPorDia = 0, modo = 'normal' }) {
  function kProf(profId, dia, bloqueId) { return `${profId}|${dia}|${bloqueId}` }
  function kGrupo(grupoId, dia, bloqueId) { return `${grupoId}|${dia}|${bloqueId}` }

  const avisosNoReparables = []

  // Verifica que las asignaciones de un grupo+día concreto sigan siendo un
  // tramo compacto desde el primer bloque de clase del día, respetando el
  // mínimo de almuerzo si corresponde — exactamente la misma regla que ya
  // aplica `compactarHuecos`. Se usa para descartar cualquier movimiento
  // de esta fase que rompería la compactación de un grupo.
  function grupoSigueCompacto(grupoId, dia, asignacionesDelGrupoDia) {
    const cantidadReal = asignacionesDelGrupoDia.length
    if (cantidadReal === 0) return true
    const cantidadObjetivo = Math.max(cantidadReal, minimoLeccionesPorDia)
    const hayFaltante = cantidadObjetivo > cantidadReal
    // Si ya había falta de carga (salida temprana) antes de esta fase, esa
    // situación no es algo que esta fase deba resolver ni empeorar — solo
    // nos importa que el tramo ocupado siga siendo continuo desde el
    // inicio del día, igual que antes.
    const objetivo = hayFaltante ? bloquesClase.slice(0, cantidadReal) : bloquesClase.slice(0, cantidadObjetivo)
    const idsObjetivo = new Set(objetivo.map(b => b.id))
    const ocupados = new Set(asignacionesDelGrupoDia.map(a => a.bloqueId))
    if (!asignacionesDelGrupoDia.every(a => idsObjetivo.has(a.bloqueId))) return false
    for (let i = 0; i < objetivo.length; i++) {
      if (ocupados.has(objetivo[i].id)) continue
      const hayClaseDespuesEnObjetivo = objetivo.slice(i + 1).some(b => ocupados.has(b.id))
      if (hayClaseDespuesEnObjetivo) return false
    }
    return true
  }

  // Índices (dentro de bloquesClase) del rango ocupado por un profesor un
  // día dado, y los huecos que tiene en medio de ese rango — se usa tanto
  // en el bucle principal como al validar si un intercambio resuelve o
  // empeora el hueco de un profesor distinto.
  function huecosDelProfesorEseDia(profesorId, dia, asignacionesSimuladas) {
    const delDia = asignacionesSimuladas.filter(a => a.profesorId === profesorId && a.dia === dia)
    const indices = delDia
      .map(a => bloquesClase.findIndex(b => b.id === a.bloqueId))
      .filter(i => i !== -1)
      .sort((x, y) => x - y)
    if (indices.length < 2) return []
    const primero = indices[0]
    const ultimo = indices[indices.length - 1]
    const ocupadosSet = new Set(indices)
    const huecos = []
    for (let i = primero; i <= ultimo; i++) {
      if (!ocupadosSet.has(i)) huecos.push(i)
    }
    return huecos
  }

  // Una candidata "movible" es una lección suelta (no parte de un bloque
  // doble/continuo) de un profesor cualquiera, con grupo real (nunca una
  // actividad). Se identifica igual que ya hacía el modo normal.
  function esUnidadSuelta(asignacion, dia) {
    const indice = bloquesClase.findIndex(b => b.id === asignacion.bloqueId)
    return !asignaciones.some(a =>
      a !== asignacion && a.profesorId === asignacion.profesorId && a.materiaId === asignacion.materiaId &&
      a.grupoId === asignacion.grupoId && a.dia === dia &&
      Math.abs(bloquesClase.findIndex(b => b.id === a.bloqueId) - indice) === 1
    )
  }

  const PROFUNDIDAD_MAXIMA_CASCADA = 2
  let intercambiosIntentados = 0
  const TOPE_INTERCAMBIOS = 3000 // límite de seguridad, igual espíritu que TOPE_AYUDAS en compactarHuecos

  // Verifica que un bloque de destino esté libre para el profesor
  // `profesorId` ese día (sin chocar con NINGUNA otra clase/actividad
  // suya), considerando el estado simulado actual de `asignaciones`.
  function profesorLibreEn(asignacionesSimuladas, profesorId, dia, bloqueId, excluir) {
    return !asignacionesSimuladas.some(a => a !== excluir && a.profesorId === profesorId && a.dia === dia && a.bloqueId === bloqueId)
  }

  // Intenta cerrar el hueco de `profesorId` en `dia`/`bloqueHueco`
  // intercambiando su lección suelta `leccionAMover` (que está en otro
  // bloque de ese mismo día) con la lección `ocupanteHueco` que hoy ocupa
  // `bloqueHueco` (de otro profesor). Tras el intercambio:
  //   - `leccionAMover` pasa a bloqueHueco.id (cierra el hueco original)
  //   - `ocupanteHueco` pasa al bloque que `leccionAMover` dejó libre
  // Ambos grupos deben seguir compactos. Si el profesor de `ocupanteHueco`
  // queda con un hueco NUEVO por este cambio, se intenta resolverlo en
  // cascada (profundidad acotada) antes de aceptar el intercambio; si esa
  // sub-resolución falla, se descarta todo el intercambio sin dejar nada
  // aplicado.
  function intentarIntercambioConCandidata({ profesorId, dia, bloqueHueco, leccionAMover, ocupanteHueco, profundidadRestante }) {
    if (profundidadRestante <= 0) return { exito: false }
    intercambiosIntentados++
    if (intercambiosIntentados > TOPE_INTERCAMBIOS) return { exito: false }

    const bloqueOrigenLeccion = leccionAMover.bloqueId
    const bloqueDestinoHueco = bloqueHueco.id
    const otroProfesor = ocupanteHueco.profesorId

    // El otro profesor debe estar libre en `bloqueOrigenLeccion` ese día
    // (si no, el intercambio directo ya es imposible sin más movimientos,
    // y no se intenta nada más complejo que esto en esta fase).
    if (!profesorLibreEn(asignaciones, otroProfesor, dia, bloqueOrigenLeccion, ocupanteHueco)) return { exito: false }
    // El grupo de `leccionAMover` no puede ya tener OTRA clase (distinta
    // de `ocupanteHueco`, que es precisamente la que se va a mover de
    // ahí) en `bloqueDestinoHueco`. Sin excluir a `ocupanteHueco` acá,
    // esta condición bloqueaba siempre el caso más común y valioso: un
    // intercambio DENTRO DEL MISMO GRUPO (ocupanteHueco y leccionAMover
    // comparten grupoId), porque bloqueDestinoHueco ya está ocupado por
    // el propio ocupanteHueco que se está reubicando.
    const hayOtraClaseEnDestino = asignaciones.some(a =>
      a !== ocupanteHueco && a.grupoId === leccionAMover.grupoId && a.dia === dia && a.bloqueId === bloqueDestinoHueco
    )
    if (hayOtraClaseEnDestino) return { exito: false }
    // Simétricamente, el grupo de `ocupanteHueco` no puede ya tener OTRA
    // clase (distinta de `leccionAMover`) en `bloqueOrigenLeccion`.
    const hayOtraClaseEnOrigen = asignaciones.some(a =>
      a !== leccionAMover && a.grupoId === ocupanteHueco.grupoId && a.dia === dia && a.bloqueId === bloqueOrigenLeccion
    )
    if (hayOtraClaseEnOrigen) return { exito: false }

    // Simulamos el intercambio y verificamos que ambos grupos sigan compactos.
    const grupoA = leccionAMover.grupoId
    const grupoB = ocupanteHueco.grupoId
    const asigGrupoA = asignaciones.filter(a => a.grupoId === grupoA && a.dia === dia)
    const asigGrupoASimuladas = asigGrupoA.map(a => (a === leccionAMover ? { ...a, bloqueId: bloqueDestinoHueco } : a))
    // OJO: este chequeo parcial (mover solo leccionAMover, dejando
    // ocupanteHueco en su lugar original) solo tiene sentido cuando son
    // grupos DISTINTOS. Si grupoA === grupoB, ocupanteHueco pertenece al
    // mismo array `asigGrupoA` y en este estado parcial quedarían DOS
    // asignaciones apuntando al mismo bloqueDestinoHueco (inconsistente:
    // ni siquiera representa un estado real) — ese caso se evalúa más
    // abajo con la simulación COMBINADA (ambas moviéndose a la vez).
    if (grupoA !== grupoB && !grupoSigueCompacto(grupoA, dia, asigGrupoASimuladas)) return { exito: false }

    const asigGrupoB = asignaciones.filter(a => a.grupoId === grupoB && a.dia === dia)
    const asigGrupoBSimuladas = asigGrupoB.map(a => (a === ocupanteHueco ? { ...a, bloqueId: bloqueOrigenLeccion } : a))
    if (grupoA !== grupoB && !grupoSigueCompacto(grupoB, dia, asigGrupoBSimuladas)) return { exito: false }
    // Si es el MISMO grupo en ambos lados (un profesor con hueco que
    // intercambia con otra clase de su propio grupo — caso raro pero
    // posible), hay que simular el conjunto completo a la vez.
    if (grupoA === grupoB) {
      const asigGrupoCombinadas = asigGrupoA.map(a => {
        if (a === leccionAMover) return { ...a, bloqueId: bloqueDestinoHueco }
        if (a === ocupanteHueco) return { ...a, bloqueId: bloqueOrigenLeccion }
        return a
      })
      if (!grupoSigueCompacto(grupoA, dia, asigGrupoCombinadas)) return { exito: false }
    }


    // Aplicar el intercambio de forma provisional para poder evaluar si
    // el otro profesor queda con un hueco nuevo.
    delete ocupacionProfesor[kProf(profesorId, dia, bloqueOrigenLeccion)]
    delete ocupacionProfesor[kProf(otroProfesor, dia, bloqueDestinoHueco)]
    delete ocupacionGrupo[kGrupo(grupoA, dia, bloqueOrigenLeccion)]
    delete ocupacionGrupo[kGrupo(grupoB, dia, bloqueDestinoHueco)]

    const bloqueOrigenLeccionOriginal = leccionAMover.bloqueId
    const bloqueDestinoHuecoOriginal = ocupanteHueco.bloqueId
    leccionAMover.bloqueId = bloqueDestinoHueco
    ocupanteHueco.bloqueId = bloqueOrigenLeccion

    ocupacionProfesor[kProf(profesorId, dia, bloqueDestinoHueco)] = true
    ocupacionProfesor[kProf(otroProfesor, dia, bloqueOrigenLeccion)] = true
    ocupacionGrupo[kGrupo(grupoA, dia, bloqueDestinoHueco)] = true
    ocupacionGrupo[kGrupo(grupoB, dia, bloqueOrigenLeccion)] = true

    function deshacerEsteIntercambio() {
      delete ocupacionProfesor[kProf(profesorId, dia, leccionAMover.bloqueId)]
      delete ocupacionProfesor[kProf(otroProfesor, dia, ocupanteHueco.bloqueId)]
      delete ocupacionGrupo[kGrupo(grupoA, dia, leccionAMover.bloqueId)]
      delete ocupacionGrupo[kGrupo(grupoB, dia, ocupanteHueco.bloqueId)]
      leccionAMover.bloqueId = bloqueOrigenLeccionOriginal
      ocupanteHueco.bloqueId = bloqueDestinoHuecoOriginal
      ocupacionProfesor[kProf(profesorId, dia, leccionAMover.bloqueId)] = true
      ocupacionProfesor[kProf(otroProfesor, dia, ocupanteHueco.bloqueId)] = true
      ocupacionGrupo[kGrupo(grupoA, dia, leccionAMover.bloqueId)] = true
      ocupacionGrupo[kGrupo(grupoB, dia, ocupanteHueco.bloqueId)] = true
    }

    // ¿El otro profesor queda con un hueco NUEVO por este cambio? Si el
    // hueco que tiene ahora ya existía antes del intercambio (mismo índice
    // exacto), no es "nuevo" — pero para simplificar y ser conservadores,
    // alcanza con exigir que, tras el cambio, sus huecos no hayan
    // aumentado en cantidad respecto a antes.
    const huecosOtroAntes = huecosDelProfesorEseDia(otroProfesor, dia, asignaciones.map(a =>
      (a === leccionAMover || a === ocupanteHueco) ? { ...a, bloqueId: a === leccionAMover ? bloqueOrigenLeccionOriginal : bloqueDestinoHuecoOriginal } : a
    ))
    const huecosOtroDespues = huecosDelProfesorEseDia(otroProfesor, dia, asignaciones)

    if (huecosOtroDespues.length > huecosOtroAntes.length) {
      // Empeoró al otro profesor: intentamos resolver SU hueco nuevo en
      // cascada antes de aceptar. Si no se puede, deshacemos todo.
      const huecoNuevoIndice = huecosOtroDespues.find(h => !huecosOtroAntes.includes(h))
      const bloqueHuecoNuevo = bloquesClase[huecoNuevoIndice]
      const resultadoCascada = intentarCerrarHuecoProfesor({
        profesorId: otroProfesor, dia, bloqueHueco: bloqueHuecoNuevo, profundidadRestante: profundidadRestante - 1,
      })
      if (!resultadoCascada.exito) {
        deshacerEsteIntercambio()
        return { exito: false }
      }
      // La cascada tuvo éxito y ya aplicó su propio cambio permanente
      // (con su propia función deshacer). Componemos el deshacer total.
      return {
        exito: true,
        deshacer: () => {
          resultadoCascada.deshacer()
          deshacerEsteIntercambio()
        },
      }
    }

    return { exito: true, deshacer: deshacerEsteIntercambio }
  }

  // Intenta mover la lección suelta `leccionAMover` de un profesor a OTRO
  // día de la semana (distinto del actual), donde quepa sin generar
  // huecos nuevos: ni en el propio horario del profesor ese otro día, ni
  // en el grupo al que pertenece esa lección, y sin chocar con ninguna
  // otra clase/actividad suya. Último recurso del modo estricto, solo se
  // intenta si ni mover-a-vacío ni ningún intercambio funcionaron.
  function intentarMoverAOtroDia({ leccionAMover, diaOriginal }) {
    const { profesorId, grupoId, bloqueId: bloqueOriginal } = leccionAMover
    for (const diaCandidato of dias) {
      if (diaCandidato === diaOriginal) continue

      for (const bloque of bloquesClase) {
        // El profesor debe estar libre ese bloque, ese día.
        if (ocupacionProfesor[kProf(profesorId, diaCandidato, bloque.id)]) continue
        // El grupo no puede ya tener otra clase ahí.
        if (ocupacionGrupo[kGrupo(grupoId, diaCandidato, bloque.id)]) continue

        // Simular: el grupo, ese nuevo día, debe seguir compacto con la
        // lección agregada.
        const asigGrupoDiaCandidato = asignaciones.filter(a => a.grupoId === grupoId && a.dia === diaCandidato)
        const simuladasConAgregado = [...asigGrupoDiaCandidato, { ...leccionAMover, dia: diaCandidato, bloqueId: bloque.id }]
        if (!grupoSigueCompacto(grupoId, diaCandidato, simuladasConAgregado)) continue

        // El grupo, en el día ORIGINAL, debe seguir compacto sin esta lección.
        const asigGrupoDiaOriginal = asignaciones.filter(a => a.grupoId === grupoId && a.dia === diaOriginal && a !== leccionAMover)
        if (!grupoSigueCompacto(grupoId, diaOriginal, asigGrupoDiaOriginal)) continue

        // El profesor, en el día candidato, no debe quedar con un hueco
        // nuevo al agregar esta lección ahí.
        const huecosAntes = huecosDelProfesorEseDia(profesorId, diaCandidato, asignaciones)
        const asignacionesConMovida = asignaciones.map(a => (a === leccionAMover ? { ...a, dia: diaCandidato, bloqueId: bloque.id } : a))
        const huecosDespues = huecosDelProfesorEseDia(profesorId, diaCandidato, asignacionesConMovida)
        if (huecosDespues.length > 0) continue // el destino en sí ya generaría o mantendría un hueco: no sirve

        // Todo válido: aplicar el movimiento de forma permanente.
        delete ocupacionProfesor[kProf(profesorId, diaOriginal, bloqueOriginal)]
        delete ocupacionGrupo[kGrupo(grupoId, diaOriginal, bloqueOriginal)]
        leccionAMover.dia = diaCandidato
        leccionAMover.bloqueId = bloque.id
        ocupacionProfesor[kProf(profesorId, diaCandidato, bloque.id)] = true
        ocupacionGrupo[kGrupo(grupoId, diaCandidato, bloque.id)] = true
        return true
      }
    }
    return false
  }

  // Punto de entrada de la cascada: intenta cerrar el hueco puntual
  // `bloqueHueco` de `profesorId` en `dia`, probando intercambio con cada
  // candidata posible en ese bloque. Se usa tanto desde el bucle
  // principal como recursivamente desde `intentarIntercambioConCandidata`.
  function intentarCerrarHuecoProfesor({ profesorId, dia, bloqueHueco, profundidadRestante }) {
    const ocupanteHueco = asignaciones.find(a => a.dia === dia && a.bloqueId === bloqueHueco.id && a.grupoId && a.profesorId !== profesorId)
    if (!ocupanteHueco || !esUnidadSuelta(ocupanteHueco, dia)) return { exito: false }

    // Candidatas del profesor con hueco: sus lecciones sueltas ese mismo
    // día, en cualquier grupo, que no sean ya el propio bloque del hueco.
    const candidatas = asignaciones.filter(a =>
      a.profesorId === profesorId && a.dia === dia && a.bloqueId !== bloqueHueco.id && a.grupoId && esUnidadSuelta(a, dia)
    )
    for (const candidata of candidatas) {
      const resultado = intentarIntercambioConCandidata({
        profesorId, dia, bloqueHueco, leccionAMover: candidata, ocupanteHueco, profundidadRestante,
      })
      if (resultado.exito) return resultado
    }
    return { exito: false }
  }

  for (const profesor of profesores) {
    for (const dia of dias) {
      const asignacionesDelProfesorDia = asignaciones.filter(a => a.profesorId === profesor.id && a.dia === dia)
      if (asignacionesDelProfesorDia.length < 2) continue // sin al menos 2 lecciones no puede haber hueco intermedio

      const indicesOcupados = asignacionesDelProfesorDia
        .map(a => bloquesClase.findIndex(b => b.id === a.bloqueId))
        .filter(i => i !== -1)
        .sort((x, y) => x - y)

      const primerIndice = indicesOcupados[0]
      const ultimoIndice = indicesOcupados[indicesOcupados.length - 1]
      const ocupadosSet = new Set(indicesOcupados)

      const indicesHueco = []
      for (let i = primerIndice; i <= ultimoIndice; i++) {
        if (!ocupadosSet.has(i)) indicesHueco.push(i)
      }
      if (indicesHueco.length === 0) continue // ya está compacto, nada que hacer

      for (const indiceHueco of indicesHueco) {
        const bloqueHueco = bloquesClase[indiceHueco]

        // Volvemos a calcular el estado REAL y actual del profesor ese
        // día antes de intentar nada con este hueco puntual — un
        // movimiento anterior, dentro de este mismo `for`, puede haber
        // cambiado su rango de ocupación (por ejemplo, si ya se cerró
        // este hueco de pasada al resolver uno anterior, o si el rango
        // ocupado se desplazó y este índice ya quedó fuera de él).
        const ocupacionActualDelDia = asignaciones.filter(a => a.profesorId === profesor.id && a.dia === dia)
        const indicesOcupadosActuales = ocupacionActualDelDia
          .map(a => bloquesClase.findIndex(b => b.id === a.bloqueId))
          .filter(i => i !== -1)
        if (indicesOcupadosActuales.length < 2) continue // ya no hay rango suficiente para tener hueco
        const primerIndiceActual = Math.min(...indicesOcupadosActuales)
        const ultimoIndiceActual = Math.max(...indicesOcupadosActuales)
        // Si este índice ya no cae dentro del rango actual, o ya está
        // ocupado, este hueco puntual ya no existe — fue resuelto de
        // pasada por un movimiento anterior en este mismo `for`.
        if (indiceHueco < primerIndiceActual || indiceHueco > ultimoIndiceActual) continue
        if (indicesOcupadosActuales.includes(indiceHueco)) continue

        // Candidatas a mover-a-vacío: cualquier clase del profesor ese
        // mismo día, en cualquier grupo, que esté FUERA del hueco (no
        // tiene sentido mover la que ya está justo ahí). Cada candidata
        // es una unidad de tamaño 1 (lección suelta) — esta fase solo
        // reubica lecciones individuales, nunca separa un bloque doble o
        // continuo. Se excluyen las actividades (sin grupoId).
        const candidatasDelDia = asignaciones.filter(a => a.profesorId === profesor.id && a.dia === dia && a.bloqueId !== bloqueHueco.id && a.grupoId)

        let resuelto = false
        for (const candidata of candidatasDelDia) {
          if (!esUnidadSuelta(candidata, dia)) continue

          // El bloque del hueco debe estar libre para el grupo de la
          // candidata (sin otra materia ya puesta ahí).
          if (ocupacionGrupo[kGrupo(candidata.grupoId, dia, bloqueHueco.id)]) continue

          // Simulamos el movimiento: candidata se va de su bloque actual
          // al bloque del hueco, dentro del mismo grupo.
          const asignacionesGrupoOriginal = asignaciones.filter(a => a.grupoId === candidata.grupoId && a.dia === dia)
          const asignacionesGrupoSimuladas = asignacionesGrupoOriginal.map(a =>
            a === candidata ? { ...a, bloqueId: bloqueHueco.id } : a
          )
          if (!grupoSigueCompacto(candidata.grupoId, dia, asignacionesGrupoSimuladas)) continue

          // También hay que confirmar que el bloque que la candidata deja
          // libre (su posición original) no le crea un hueco NUEVO a su
          // propio grupo — ya cubierto por `grupoSigueCompacto` arriba,
          // que evalúa el conjunto completo simulado.

          // Si llegamos aquí, el movimiento es seguro: aplicarlo.
          delete ocupacionProfesor[kProf(candidata.profesorId, dia, candidata.bloqueId)]
          delete ocupacionGrupo[kGrupo(candidata.grupoId, dia, candidata.bloqueId)]
          candidata.bloqueId = bloqueHueco.id
          ocupacionProfesor[kProf(candidata.profesorId, dia, candidata.bloqueId)] = true
          ocupacionGrupo[kGrupo(candidata.grupoId, dia, candidata.bloqueId)] = true

          resuelto = true
          break
        }

        // MODO ESTRICTO: si mover-a-vacío no resolvió este hueco, se
        // intenta intercambio (con cascada) y, si tampoco, mover a otro
        // día — en ese orden, como último recurso.
        if (!resuelto && modo === 'estricto') {
          const resultadoIntercambio = intentarCerrarHuecoProfesor({
            profesorId: profesor.id, dia, bloqueHueco, profundidadRestante: PROFUNDIDAD_MAXIMA_CASCADA,
          })
          if (resultadoIntercambio.exito) {
            resuelto = true
          }
        }

        if (!resuelto && modo === 'estricto') {
          // Último recurso: mover alguna lección suelta del profesor ese
          // día (cualquiera, no necesariamente adyacente al hueco) a otro
          // día completo, para que el rango de ese día se acorte y el
          // hueco deje de estar "en medio". Se intenta con cada candidata
          // suelta del día, empezando por las más cercanas al hueco.
          const candidatasParaOtroDia = asignaciones
            .filter(a => a.profesorId === profesor.id && a.dia === dia && a.grupoId && esUnidadSuelta(a, dia))
            .sort((a, b) => {
              const iA = bloquesClase.findIndex(b2 => b2.id === a.bloqueId)
              const iB = bloquesClase.findIndex(b2 => b2.id === b.bloqueId)
              return Math.abs(iA - indiceHueco) - Math.abs(iB - indiceHueco)
            })
          for (const candidata of candidatasParaOtroDia) {
            if (intentarMoverAOtroDia({ leccionAMover: candidata, diaOriginal: dia })) {
              resuelto = true
              break
            }
          }
        }

        if (!resuelto) {
          avisosNoReparables.push({
            tipo: 'huecoProfesor',
            profesorId: profesor.id,
            profesorNombre: profesor.nombre,
            dia,
            bloqueId: bloqueHueco.id,
            bloqueNumero: bloqueHueco.numero,
          })
        }
      }
    }
  }

  return avisosNoReparables
}
