import Chip from '../Chip';

interface DayPickerProps {
  availableDays: number[];
  currentDay: number;
  onDayChange: (day: number) => void;
}

export default function DayPicker({ availableDays, currentDay, onDayChange }: DayPickerProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {availableDays.map((d) => (
        <Chip
          key={d}
          label={`Day ${d}`}
          active={currentDay === d}
          onClick={() => onDayChange(d)}
        />
      ))}
    </div>
  );
}