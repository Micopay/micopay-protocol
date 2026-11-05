/** WP7 · #14: el mapa no ofrece al usuario como su propio agente. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DepositMap from '../pages/DepositMap';
import ExploreMap from '../pages/ExploreMap';

const ME = 'me';
const OTHER = 'other';

vi.mock('../hooks/useMerchantsAvailable', () => ({
  useMerchantsAvailable: () => ({
    state: {
      status: 'success',
      merchants: [
        { seller_id: 'me', username: 'yo', rate_percent: 1, payout_mxn: 490, distance_km: 0 },
        { seller_id: 'other', username: 'otro', rate_percent: 1, payout_mxn: 490, distance_km: 1 },
      ],
      userPosition: { latitude: 19, longitude: -96 },
    },
    refetch: vi.fn(),
  }),
}));
vi.mock('../components/MapReal', () => ({ default: () => <div data-testid="map-real" /> }));
vi.mock('../components/MerchantOfferCard', () => ({
  default: ({ merchant }: { merchant: { seller_id: string } }) => <div data-testid={`offer-${merchant.seller_id}`} />,
}));

describe('#14 · la cuenta propia no aparece como agente', () => {
  it('DepositMap', () => {
    render(<DepositMap onBack={() => {}} onSelectOffer={() => {}} amount={500} viewerId={ME} />);
    expect(screen.queryByTestId(`offer-${ME}`)).toBeNull();
    expect(screen.getByTestId(`offer-${OTHER}`)).toBeInTheDocument();
  });

  it('ExploreMap', () => {
    render(<ExploreMap onBack={() => {}} onSelectOffer={() => {}} amount={500} viewerId={ME} />);
    expect(screen.queryByTestId(`offer-${ME}`)).toBeNull();
    expect(screen.getByTestId(`offer-${OTHER}`)).toBeInTheDocument();
  });
});
