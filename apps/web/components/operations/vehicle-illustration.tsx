import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { WorkshopVehicleType } from '@/lib/api';

const illustrationByType: Record<WorkshopVehicleType, string> = {
  CAR: '/vehicles/car.png',
  SUV: '/vehicles/suv.png',
};

export function VehicleIllustration({
  type,
  className,
}: {
  type: WorkshopVehicleType | null | undefined;
  className?: string;
}) {
  const source = type ? illustrationByType[type] : illustrationByType.CAR;

  return (
    <Image
      src={source}
      alt=""
      width={160}
      height={120}
      sizes="80px"
      className={cn('object-contain', className)}
    />
  );
}
