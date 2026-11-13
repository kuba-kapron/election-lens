// The legend under the map: each view writes its own.
import { view } from "./country.js";

// the legend: each view says what its colors mean (see views/)
export function drawLegend() {
  document.getElementById("legend").innerHTML = view().legend();
}

