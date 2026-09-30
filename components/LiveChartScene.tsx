"use client";
// npm i three @react-three/fiber @react-three/drei lightweight-charts
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

/* ---------- 3D background: drifting particle field + wireframe knot ---------- */
function Particles({ count = 1500 }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() - 0.5) * 30;
    return a;
  }, [count]);

  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.02;
    ref.current.rotation.x += dt * 0.005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#4fd1c5" transparent opacity={0.6} />
    </points>
  );
}

function Knot() {
  return (
    <Float speed={1.2} rotationIntensity={0.6} floatIntensity={1}>
      <mesh position={[5, 1, -6]}>
        <torusKnotGeometry args={[1.6, 0.4, 160, 24]} />
        <meshBasicMaterial color="#2b6cb0" wireframe transparent opacity={0.35} />
      </mesh>
    </Float>
  );
}

/* ---------- Live candlestick chart via Binance WebSocket ---------- */
function useBinanceCandles(
  series: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  symbol = "btcusdt",
  interval = "1m"
) {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let closed = false;

    // 1) Seed with recent history (REST)
    fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=300`
    )
      .then((r) => r.json())
      .then((rows: any[]) => {
        series.current?.setData(
          rows.map((k) => ({
            time: (k[0] / 1000) as UTCTimestamp,
            open: +k[1],
            high: +k[2],
            low: +k[3],
            close: +k[4],
          }))
        );
      })
      .catch(console.error);

    // 2) Stream live updates (WS) with auto-reconnect
    const connect = () => {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`);
      ws.onopen = () => (retry = 0);
      ws.onmessage = (e) => {
        const { k } = JSON.parse(e.data);
        series.current?.update({
          time: (k.t / 1000) as UTCTimestamp,
          open: +k.o,
          high: +k.h,
          low: +k.l,
          close: +k.c,
        });
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
      };
    };
    connect();

    return () => {
      closed = true;
      ws?.close();
    };
  }, [series, symbol, interval]);
}

function LiveChart({ symbol = "btcusdt" }: { symbol?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    const chart = createChart(container.current!, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#cbd5e0" },
      grid: { vertLines: { color: "#ffffff10" }, horzLines: { color: "#ffffff10" } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
    });
    chartRef.current = chart;
    return () => chart.remove();
  }, []);

  useBinanceCandles(seriesRef, symbol);

  return <div ref={container} style={{ width: "100%", height: "100%" }} />;
}

/* ---------- Composition ---------- */
export default function LiveChartScene() {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#070b14" }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ position: "absolute", inset: 0 }}
        dpr={[1, 2]}
      >
        <Particles />
        <Knot />
      </Canvas>

      <div
        style={{
          position: "absolute",
          inset: "8% 6%",
          borderRadius: 12,
          background: "rgba(10,16,28,0.72)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 8,
        }}
      >
        <LiveChart symbol="btcusdt" />
      </div>
    </div>
  );
}
