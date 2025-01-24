import { Format, matchColor, registerBrand } from "material-chalk";

const paimaBrandColor = matchColor("#1BB17B");
registerBrand("paima", paimaBrandColor.formatAs(Format.Hct));

const hardhatBrandColor = matchColor("#FFF100");
registerBrand("hardhat", hardhatBrandColor.formatAs(Format.Hct));

const dolosBrandColor = matchColor("#FF0065");
registerBrand("dolos", dolosBrandColor.formatAs(Format.Hct));