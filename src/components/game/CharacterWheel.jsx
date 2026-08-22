import PrizeWheel from '@/components/game/PrizeWheel';

export default function CharacterWheel({
  studentData,
  onSpend,
  onUnlock,
  onClose,
}) {
  return (
    <PrizeWheel
      studentData={studentData}
      onSpend={onSpend}
      onUnlock={onUnlock}
      onClose={onClose}
      freeSpin={false}
      source="character-wheel"
    />
  );
}