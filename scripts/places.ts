// Small gazetteer of NC500-area places, used to auto-label days as
// "Start → End" when the GPX track names are generic or all identical.
import { haversineM, type Point } from './geo'

const PLACES: Array<[string, number, number]> = [
  // name, lng, lat
  ['Inverness', -4.2247, 57.4778],
  ['Beauly', -4.464, 57.485],
  ['Muir of Ord', -4.453, 57.517],
  ['Dingwall', -4.427, 57.596],
  ['Contin', -4.566, 57.565],
  ['Garve', -4.687, 57.612],
  ['Achnasheen', -5.207, 57.58],
  ['Strathcarron', -5.427, 57.421],
  ['Lochcarron', -5.404, 57.39],
  ['Kishorn', -5.52, 57.367],
  ['Applecross', -5.81, 57.432],
  ['Shieldaig', -5.647, 57.522],
  ['Torridon', -5.512, 57.545],
  ['Kinlochewe', -5.302, 57.607],
  ['Gairloch', -5.69, 57.728],
  ['Poolewe', -5.61, 57.762],
  ['Aultbea', -5.588, 57.839],
  ['Dundonnell', -5.246, 57.868],
  ['Ullapool', -5.16, 57.895],
  ['Ardmair', -5.196, 57.935],
  ['Achiltibuie', -5.35, 58.026],
  ['Ledmore', -4.97, 58.05],
  ['Lochinver', -5.245, 58.145],
  ['Drumbeg', -5.199, 58.238],
  ['Kylesku', -5.024, 58.258],
  ['Scourie', -5.157, 58.353],
  ['Kinlochbervie', -5.05, 58.457],
  ['Durness', -4.745, 58.568],
  ['Tongue', -4.42, 58.476],
  ['Bettyhill', -4.226, 58.52],
  ['Melvich', -3.917, 58.556],
  ['Thurso', -3.525, 58.595],
  ['Dunnet', -3.344, 58.616],
  ['John o’ Groats', -3.07, 58.644],
  ['Wick', -3.093, 58.454],
  ['Lybster', -3.294, 58.297],
  ['Dunbeath', -3.417, 58.243],
  ['Helmsdale', -3.658, 58.115],
  ['Brora', -3.85, 58.01],
  ['Golspie', -3.98, 57.972],
  ['Lairg', -4.397, 58.02],
  ['Bonar Bridge', -4.343, 57.885],
  ['Dornoch', -4.028, 57.88],
  ['Tain', -4.053, 57.811],
  ['Alness', -4.255, 57.695],
]

const MAX_DIST_M = 9000

export function nearestPlace(p: Point): string | null {
  let best: string | null = null
  let bestDist = MAX_DIST_M
  for (const [name, lng, lat] of PLACES) {
    const d = haversineM(p, { lng, lat, ele: null, time: null })
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}
