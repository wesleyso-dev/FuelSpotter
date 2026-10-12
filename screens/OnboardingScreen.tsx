// screens/OnboardingScreen.tsx
import React, { useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#A3E635';
const TOTAL = 4;

// Every slide fades, lifts and scales based on how far it is from center.
function Slide({ index, scrollX, width, children }: {
  index: number; scrollX: SharedValue<number>; width: number; children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(scrollX.value, input, [48, 0, 48], Extrapolation.CLAMP) },
        { scale: interpolate(scrollX.value, input, [0.9, 1, 0.9], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <View style={{ width }} className="flex-1 justify-center px-8">
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  );
}

function IconBadge({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View className="mb-8 h-24 w-24 items-center justify-center rounded-3xl" style={{ backgroundColor: 'rgba(163,230,53,0.12)' }}>
      <Ionicons name={name} size={48} color={ACCENT} />
    </View>
  );
}

// The price slide: strike-throughs draw themselves and "$0" pops as you swipe in.
function PriceCard({ label, price, progress }: { label: string; price: string; progress: SharedValue<number> }) {
  const strike = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-neutral-900 px-5 py-4">
      <Text className="text-lg text-neutral-300">{label}</Text>
      <View>
        <Text className="text-2xl font-bold text-white">{price}</Text>
        <Animated.View style={[{ position: 'absolute', top: '52%', height: 3, backgroundColor: ACCENT, borderRadius: 2 }, strike]} />
      </View>
    </View>
  );
}

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const [page, setPage] = useState(0);

  const onScroll = useAnimatedScrollHandler((e) => { scrollX.value = e.contentOffset.x; });

  // 0 until the price slide is ~40% in view, 1 once it's centered.
  const priceProgress = useSharedValue(0);
  useAnimatedStyle(() => {
    priceProgress.value = interpolate(scrollX.value, [width * 0.6, width], [0, 1], Extrapolation.CLAMP);
    return {};
  });
  const zeroStyle = useAnimatedStyle(() => ({
    opacity: priceProgress.value,
    transform: [{ scale: interpolate(priceProgress.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) }],
  }));

  const next = () => {
    if (page === TOTAL - 1) return onDone();
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View className="flex-1 bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="h-12 flex-row items-center justify-end px-6">
        {page < TOTAL - 1 && (
          <Pressable onPress={onDone} hitSlop={12}><Text className="text-neutral-400">Skip</Text></Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        <Slide index={0} scrollX={scrollX} width={width}>
          <IconBadge name="flash" />
          <Text className="mb-3 text-4xl font-bold leading-tight text-white">Free energy drinks are parked all over town.</Text>
          <Text className="text-lg text-neutral-400">Promo trucks and branded Minis hand out full cans for nothing. Nobody posts a schedule.</Text>
        </Slide>

        <Slide index={1} scrollX={scrollX} width={width}>
          <Text className="mb-6 text-4xl font-bold leading-tight text-white">$6.78 of drinks. For $0.</Text>
          <PriceCard label="Red Bull" price="$2.79" progress={priceProgress} />
          <PriceCard label="Monster Energy" price="$3.99" progress={priceProgress} />
          <Animated.View style={zeroStyle} className="mt-3 items-center rounded-2xl py-5">
            <Text className="text-6xl font-extrabold" style={{ color: ACCENT }}>$0</Text>
            <Text className="mt-1 text-neutral-400">from the truck</Text>
          </Animated.View>
          <Text className="mt-4 text-center text-xs text-neutral-600">Typical single-can retail prices.</Text>
        </Slide>

        <Slide index={2} scrollX={scrollX} width={width}>
          <IconBadge name="map" />
          <Text className="mb-3 text-4xl font-bold leading-tight text-white">The hard part is finding them.</Text>
          <Text className="text-lg text-neutral-400">Trucks move every hour. By the time a friend texts you, it's gone. FuelSpotter shows live sightings on a map, with a countdown on every pin.</Text>
        </Slide>

        <Slide index={3} scrollX={scrollX} width={width}>
          <IconBadge name="flame" />
          <Text className="mb-3 text-4xl font-bold leading-tight text-white">Spot one. Keep your streak.</Text>
          <Text className="text-lg text-neutral-400">One live, verified photo a day keeps the map honest and your streak alive. No camera-roll uploads. Ever.</Text>
        </Slide>
      </Animated.ScrollView>

      <View className="px-6" style={{ paddingBottom: insets.bottom + 20 }}>
        <View className="mb-6 flex-row justify-center gap-2">
          {Array.from({ length: TOTAL }).map((_, i) => <Dot key={i} index={i} scrollX={scrollX} width={width} />)}
        </View>
        <Pressable onPress={next} className="items-center rounded-full py-4" style={{ backgroundColor: ACCENT }}>
          <Text className="text-base font-bold text-black">{page === TOTAL - 1 ? 'Get started' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Dot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(scrollX.value, input, [8, 24, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, input, [0.35, 1, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: ACCENT }, style]} />;
}