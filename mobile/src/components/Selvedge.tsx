import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { colors, selvedge } from '../theme';

interface SelvedgeProps {
  /** Defaults to the standard hairline colour. Pass `onDark` for a filled surface. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Hides the baseline, leaving only the ticks — for edges that already have a border. */
  baseline?: boolean;
}

/**
 * ── The signature ────────────────────────────────────────────────────────
 *
 * A selvedge: the self-finished edge of woven cloth, where the weft turns back
 * on itself instead of being cut. Every bolt in the shop has one, and it is
 * the first thing a trader runs a thumb along to judge the cloth.
 *
 * Drawn as a hairline with ticks hanging off it at alternating lengths — the
 * same over-and-under as the plain weave in the brand mark, so the app's one
 * repeated ornament and its logo are the same structure at two scales.
 *
 * Used *only* where content genuinely ends — the top edge of the billing dock,
 * and under a section header. It is a finishing detail; the moment it appears
 * twice on one edge it stops being one.
 *
 * The tick count is solved from the measured width rather than an SVG
 * `Pattern`, so the band always ends on a whole tick instead of a clipped one.
 */
export function Selvedge({ color = colors.border, style, baseline = true }: SelvedgeProps) {
  const [width, setWidth] = useState(0);
  const height = selvedge.tick;

  // Measured on first layout; until then the band reserves its height but
  // draws nothing, so no partial weave flashes on mount.
  const ticks: number[] = [];
  if (width > 0) {
    for (let x = selvedge.pitch / 2; x < width; x += selvedge.pitch) ticks.push(x);
  }

  return (
    <View
      style={[{ height }, style]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      // Texture, not content: a screen reader has nothing to say about it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {baseline ? (
            <Line
              x1={0}
              y1={0}
              x2={width}
              y2={0}
              stroke={color}
              strokeWidth={selvedge.strokeWidth}
              opacity={selvedge.opacity}
            />
          ) : null}

          {ticks.map((x, index) => (
            <Line
              key={x}
              x1={x}
              y1={0}
              x2={x}
              // Alternating depth is the interlace: a weft loop that turned at
              // this edge sits proud of one that passed beneath.
              y2={index % 2 === 0 ? height : height * 0.5}
              stroke={color}
              strokeWidth={selvedge.strokeWidth}
              opacity={selvedge.opacity}
              strokeLinecap="butt"
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * The selvedge pinned to the top edge of a dock or sheet.
 *
 * No baseline: a dock already has a top border, and drawing a second hairline
 * a pixel below it reads as a rendering fault rather than a finish. The ticks
 * hang off the border that is already there.
 */
export function SelvedgeEdge({ color }: { color?: string }) {
  return <Selvedge baseline={false} {...(color ? { color } : null)} style={styles.edge} />;
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
