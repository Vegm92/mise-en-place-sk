export const palettes = [
  {
    key: 'Pizarra', letter: 'A', name: 'Pizarra',
    tag: 'Neutro frío · azul pizarra',
    why: 'La paleta actual, apretada. Cromas bajos y el azul reservado a la acción: ningún estado del sistema — rojo, ámbar, verde — compite con el botón.',
    cost: 'Es la más segura y la menos memorable — y el azul de acción vive muy cerca del azul informativo.',
    light: {
      bg:'#f2f4f6', surface:'#ffffff', surface2:'#f8fafb', fg:'#171c22', fg2:'#48525e', fg3:'#5d6873', fg4:'#6b7682',
      border:'rgba(15,20,30,0.10)', borderStrong:'rgba(15,20,30,0.18)', divider:'rgba(15,20,30,0.06)', hover:'rgba(15,20,30,0.04)',
      acc:'#34507a', accFg:'#ffffff', accSoft:'rgba(52,80,122,0.10)', accRing:'rgba(52,80,122,0.30)',
      pos:'#14694a', posSoft:'rgba(20,105,74,0.12)', neg:'#b03a3a', negSoft:'rgba(176,58,58,0.12)',
      warn:'#a85300', warnSoft:'rgba(168,83,0,0.12)', caution:'#7f6b00', cautionSoft:'rgba(127,107,0,0.14)',
      info:'#2a5fb5', infoSoft:'rgba(42,95,181,0.12)'
    },
    dark: {
      bg:'#15181c', surface:'#1d2126', surface2:'#24282e', fg:'#e7eaee', fg2:'#a2aab3', fg3:'#8b939c', fg4:'#767e87',
      border:'rgba(255,255,255,0.08)', borderStrong:'rgba(255,255,255,0.14)', divider:'rgba(255,255,255,0.05)', hover:'rgba(255,255,255,0.05)',
      acc:'#6f8fc4', accFg:'#0d1828', accSoft:'rgba(111,143,196,0.16)', accRing:'rgba(111,143,196,0.30)',
      pos:'#4cae7d', posSoft:'rgba(76,174,125,0.18)', neg:'#e16b6b', negSoft:'rgba(225,107,107,0.18)',
      warn:'#e8934a', warnSoft:'rgba(232,147,74,0.18)', caution:'#efc233', cautionSoft:'rgba(239,194,51,0.18)',
      info:'#5f8ee0', infoSoft:'rgba(95,142,224,0.18)'
    }
  },
  {
    key: 'Cocina', letter: 'B', name: 'Cocina',
    tag: 'Neutro cálido · terracota',
    why: 'Papel cálido y barro cocido: la temperatura de una cocina, no la de un ERP. El acento se lee como material, no como marca de software.',
    cost: 'El acento comparte franja de tono con aviso y alerta. Aquí ya está separado todo lo que se puede sin salir del barro, pero en la tarjeta destacada el botón y su filo de alerta siguen siendo primos.',
    light: {
      bg:'#f6f1e8', surface:'#fffdf9', surface2:'#faf6ee', fg:'#221c16', fg2:'#564c42', fg3:'#6b6055', fg4:'#7a6f63',
      border:'rgba(40,28,16,0.12)', borderStrong:'rgba(40,28,16,0.20)', divider:'rgba(40,28,16,0.07)', hover:'rgba(40,28,16,0.04)',
      acc:'#a04a20', accFg:'#ffffff', accSoft:'rgba(160,74,32,0.10)', accRing:'rgba(160,74,32,0.28)',
      pos:'#3d6b1f', posSoft:'rgba(61,107,31,0.12)', neg:'#9f2b2b', negSoft:'rgba(159,43,43,0.12)',
      warn:'#96590b', warnSoft:'rgba(150,89,11,0.12)', caution:'#7d6b12', cautionSoft:'rgba(125,107,18,0.14)',
      info:'#2c5f96', infoSoft:'rgba(44,95,150,0.12)'
    },
    dark: {
      bg:'#1a1613', surface:'#221d19', surface2:'#2a2420', fg:'#efe7dc', fg2:'#b0a498', fg3:'#968a7e', fg4:'#82766a',
      border:'rgba(255,240,225,0.09)', borderStrong:'rgba(255,240,225,0.16)', divider:'rgba(255,240,225,0.06)', hover:'rgba(255,240,225,0.05)',
      acc:'#e29a5f', accFg:'#2a1409', accSoft:'rgba(226,154,95,0.16)', accRing:'rgba(226,154,95,0.30)',
      pos:'#84b45c', posSoft:'rgba(132,180,92,0.18)', neg:'#e4675f', negSoft:'rgba(228,103,95,0.18)',
      warn:'#d9a03f', warnSoft:'rgba(217,160,63,0.18)', caution:'#cbb84a', cautionSoft:'rgba(203,184,74,0.18)',
      info:'#6f9ad4', infoSoft:'rgba(111,154,212,0.18)'
    }
  },
  {
    key: 'Huerta', letter: 'C', name: 'Huerta',
    tag: 'Neutro verdoso · pino',
    why: 'Verde de género fresco: el color que un jefe de cocina asocia a la mercancía que entra bien. Es la única dirección cuyo acento nombra literalmente lo que se compra.',
    cost: 'Obliga a mover “positivo” a un verde azulado para que el verde de acción no signifique “todo bien”.',
    light: {
      bg:'#f1f4ef', surface:'#ffffff', surface2:'#f7f9f5', fg:'#171d19', fg2:'#47544c', fg3:'#5c6a61', fg4:'#6a776e',
      border:'rgba(16,30,22,0.11)', borderStrong:'rgba(16,30,22,0.19)', divider:'rgba(16,30,22,0.06)', hover:'rgba(16,30,22,0.04)',
      acc:'#1f5c3d', accFg:'#ffffff', accSoft:'rgba(31,92,61,0.10)', accRing:'rgba(31,92,61,0.28)',
      pos:'#0f6b78', posSoft:'rgba(15,107,120,0.12)', neg:'#b03a3a', negSoft:'rgba(176,58,58,0.12)',
      warn:'#a85300', warnSoft:'rgba(168,83,0,0.12)', caution:'#7f6b00', cautionSoft:'rgba(127,107,0,0.14)',
      info:'#2a5fb5', infoSoft:'rgba(42,95,181,0.12)'
    },
    dark: {
      bg:'#141715', surface:'#1c201d', surface2:'#232823', fg:'#e6ebe6', fg2:'#a0aaa3', fg3:'#89938c', fg4:'#747e77',
      border:'rgba(230,255,238,0.08)', borderStrong:'rgba(230,255,238,0.15)', divider:'rgba(230,255,238,0.05)', hover:'rgba(230,255,238,0.05)',
      acc:'#57ab7f', accFg:'#08211a', accSoft:'rgba(87,171,127,0.16)', accRing:'rgba(87,171,127,0.30)',
      pos:'#46b3ba', posSoft:'rgba(70,179,186,0.18)', neg:'#e16b6b', negSoft:'rgba(225,107,107,0.18)',
      warn:'#e8934a', warnSoft:'rgba(232,147,74,0.18)', caution:'#efc233', cautionSoft:'rgba(239,194,51,0.18)',
      info:'#5f8ee0', infoSoft:'rgba(95,142,224,0.18)'
    }
  },
  {
    key: 'Tinta', letter: 'D', name: 'Tinta',
    tag: 'Papel y tinta · sin color de marca',
    why: 'La marca es la tinta. El botón primario es negro, así que el color deja de ser decoración y pasa a ser exclusivamente señal: si algo tiene color en la pantalla, significa algo.',
    cost: 'Sin acento propio la interfaz no tiene personalidad de color — se sostiene entera sobre la tipografía y el espaciado. Y en oscuro el primario se vuelve un rectángulo blanco que pesa mucho.',
    light: {
      bg:'#f1f0ee', surface:'#ffffff', surface2:'#f8f7f5', fg:'#17171a', fg2:'#46464a', fg3:'#5b5b60', fg4:'#6b6b70',
      border:'rgba(20,20,24,0.13)', borderStrong:'rgba(20,20,24,0.22)', divider:'rgba(20,20,24,0.07)', hover:'rgba(20,20,24,0.04)',
      acc:'#17171a', accFg:'#ffffff', accSoft:'rgba(23,23,26,0.07)', accRing:'rgba(23,23,26,0.22)',
      pos:'#14694a', posSoft:'rgba(20,105,74,0.12)', neg:'#b03a3a', negSoft:'rgba(176,58,58,0.12)',
      warn:'#a85300', warnSoft:'rgba(168,83,0,0.12)', caution:'#7f6b00', cautionSoft:'rgba(127,107,0,0.14)',
      info:'#2a5fb5', infoSoft:'rgba(42,95,181,0.12)'
    },
    dark: {
      bg:'#131314', surface:'#1b1b1d', surface2:'#222224', fg:'#edecea', fg2:'#a5a5aa', fg3:'#8d8d93', fg4:'#78787e',
      border:'rgba(255,255,255,0.09)', borderStrong:'rgba(255,255,255,0.16)', divider:'rgba(255,255,255,0.06)', hover:'rgba(255,255,255,0.05)',
      acc:'#edecea', accFg:'#17171a', accSoft:'rgba(237,236,234,0.12)', accRing:'rgba(237,236,234,0.25)',
      pos:'#4cae7d', posSoft:'rgba(76,174,125,0.18)', neg:'#e16b6b', negSoft:'rgba(225,107,107,0.18)',
      warn:'#e8934a', warnSoft:'rgba(232,147,74,0.18)', caution:'#efc233', cautionSoft:'rgba(239,194,51,0.18)',
      info:'#5f8ee0', infoSoft:'rgba(95,142,224,0.18)'
    }
  },
  {
    key: 'Bodega', letter: 'E', name: 'Bodega',
    tag: 'Neutro violáceo · ciruela',
    why: 'Ciruela: un acento que no ocupa ninguna casilla semántica, así que rojo, ámbar, verde y azul quedan enteros para significar.',
    cost: 'Es el que menos sabe a restaurante, y el violeta es el primer tono que se va en pantallas baratas y a contraluz — justo las que hay montadas en una cocina.',
    light: {
      bg:'#f4f2f5', surface:'#ffffff', surface2:'#faf8fb', fg:'#1b171f', fg2:'#4e4756', fg3:'#625b6a', fg4:'#716a79',
      border:'rgba(27,23,31,0.11)', borderStrong:'rgba(27,23,31,0.19)', divider:'rgba(27,23,31,0.06)', hover:'rgba(27,23,31,0.04)',
      acc:'#6b3a72', accFg:'#ffffff', accSoft:'rgba(107,58,114,0.10)', accRing:'rgba(107,58,114,0.28)',
      pos:'#14694a', posSoft:'rgba(20,105,74,0.12)', neg:'#b03a3a', negSoft:'rgba(176,58,58,0.12)',
      warn:'#a85300', warnSoft:'rgba(168,83,0,0.12)', caution:'#7f6b00', cautionSoft:'rgba(127,107,0,0.14)',
      info:'#2a5fb5', infoSoft:'rgba(42,95,181,0.12)'
    },
    dark: {
      bg:'#18151b', surface:'#201c23', surface2:'#27232b', fg:'#eae6ee', fg2:'#a9a1b1', fg3:'#928a9a', fg4:'#7d7587',
      border:'rgba(245,235,255,0.09)', borderStrong:'rgba(245,235,255,0.16)', divider:'rgba(245,235,255,0.06)', hover:'rgba(245,235,255,0.05)',
      acc:'#b681c2', accFg:'#21102a', accSoft:'rgba(182,129,194,0.16)', accRing:'rgba(182,129,194,0.30)',
      pos:'#4cae7d', posSoft:'rgba(76,174,125,0.18)', neg:'#e16b6b', negSoft:'rgba(225,107,107,0.18)',
      warn:'#e8934a', warnSoft:'rgba(232,147,74,0.18)', caution:'#efc233', cautionSoft:'rgba(239,194,51,0.18)',
      info:'#5f8ee0', infoSoft:'rgba(95,142,224,0.18)'
    }
  }
];
