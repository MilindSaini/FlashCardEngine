type HeatmapPoint = {
  date: string;
  reviews: number;
};

export function Heatmap({ data }: { data: HeatmapPoint[] }) {
  const max = Math.max(...data.map((item) => item.reviews), 1);

  const level = (value: number) => {
    const ratio = value / max;
    if (ratio === 0) return 0;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  return (
    <div className="heatmap">
      {data.map((cell) => (
        <div
          key={cell.date}
          className={`heat level-${level(cell.reviews)}`}
          title={`${cell.date}: ${cell.reviews} reviews`}
        />
      ))}
    </div>
  );
}
