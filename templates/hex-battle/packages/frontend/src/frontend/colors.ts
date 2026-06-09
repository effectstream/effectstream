export class Colors {
  static readonly black = '#000000';
  static readonly white = '#ffffff';
  private static readonly oldColors = [
    '#1abc9c', // turquoise
    '#3498db', // peter river
    '#9b59b6', // amethyst
    '#e67e22', // carrot
    '#e74c3c', // alizarin
    '#2ecc71', // emerald
    '#f1c40f', // sun flower
    '#34495e', // wet asphalt
    '#95a5a6', // concrete
    '#f39c12', // orange
  ];

  public static readonly colorDark = '#614746';
  public static readonly colors = [
    '#F7D4CA', // light red
    '#FFFCF0', // light yellow
    '#FAE0C6', // light orange
    '#DDEAE3', // light blue
    '#DDEAE3', // light green
  ];

  static getColor(playerId: string) {
    switch (playerId) {
      case 'A':
        return Colors.mix(Colors.oldColors[0], Colors.white, 80); // turquoise
      case 'B':
        return Colors.mix(Colors.oldColors[1], Colors.white, 80); // peter river
      case 'C':
        return Colors.mix(Colors.oldColors[2], Colors.white, 80); // amethyst
      case 'D':
        return Colors.mix(Colors.oldColors[3], Colors.white, 80); // carrot
      case 'E':
        return Colors.mix(Colors.oldColors[4], Colors.white, 80); // alizarin
    }
    throw new Error('missing color');
  }

  private static colorMap = new Map();
  public static mix = function (
    colorA: string,
    colorB: string,
    weight: number
  ) {
    const key = `mix-${colorA}-${colorB}-${weight}`;
    if (Colors.colorMap.has(key)) return Colors.colorMap.get(key);

    const color_1 = colorA.replace(/^#/, '').toLocaleLowerCase();
    const color_2 = colorB.replace(/^#/, '').toLocaleLowerCase();
    function d2h(d: number) {
      return d.toString(16);
    } // convert a decimal value to hex
    function h2d(h: string) {
      return parseInt(h, 16);
    } // convert a hex value to decimal

    let color = '';

    for (let i = 0; i <= 5; i += 2) {
      // loop through each of the 3 hex pairs—red, green, and blue
      const v1 = h2d(color_1.substr(i, 2)); // extract the current pairs
      const v2 = h2d(color_2.substr(i, 2));
      // combine the current pairs from each source color, according to the specified weight
      let val = d2h(Math.floor(v2 + (v1 - v2) * (weight / 100.0)));

      while (val.length < 2) {
        val = '0' + val;
      } // prepend a '0' if val results in a single digit

      color += val; // concatenate val to our new color string
    }
    Colors.colorMap.set(key, '#' + color);
    return '#' + color; // PROFIT!
  };

  // calculate shade of color [-100, 100]
  public static shadeColor(color: string, percent: number) {
    const key = `shade-${color}-${percent}`;
    if (Colors.colorMap.has(key)) return Colors.colorMap.get(key);

    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = ((R * (100 + percent)) / 100) | 0;
    G = ((G * (100 + percent)) / 100) | 0;
    B = ((B * (100 + percent)) / 100) | 0;

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    R = Math.round(R);
    G = Math.round(G);
    B = Math.round(B);

    const RR =
      R.toString(16).length === 1 ? '0' + R.toString(16) : R.toString(16);
    const GG =
      G.toString(16).length === 1 ? '0' + G.toString(16) : G.toString(16);
    const BB =
      B.toString(16).length === 1 ? '0' + B.toString(16) : B.toString(16);

    Colors.colorMap.set(key, '#' + RR + GG + BB);
    return '#' + RR + GG + BB;
  }
}
