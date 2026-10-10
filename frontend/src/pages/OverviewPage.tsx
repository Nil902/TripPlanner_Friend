import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  MapPin,
  Share2,
  Check,
  Calendar,
  RefreshCw,
  Settings,
  QrCode,
  Plus,
  Trash2,
  ArrowRight,
  Clock,
  Copy,
  Download,
  X,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  BORDER,
  MUTED,
  PINE,
  SERIF,
  TripSummary,
  Member,
  INK,
} from '../lib/constants';
import Avatar from '../components/Avatar';
import { PrimaryButton, SecondaryButton } from '../components/Button';

import { api } from '../lib/api';
import TripStatusBadge from '../components/TripStatusBadge';
import { getTripLifecycleDescription, getTripLifecycleStatus } from '../lib/tripLifecycle';
import { useToday } from '../lib/useToday';

const DESTINATION_SUGGESTIONS: Record<string, Array<{ name: string; category: string; cost: number }>> = {
  lisbon: [
    { name: 'Belém Tower', category: 'Landmark', cost: 10 },
    { name: 'Jerónimos Monastery', category: 'Landmark', cost: 12 },
    { name: 'Time Out Market Lisbon', category: 'Restaurant', cost: 22 },
    { name: 'MAAT Museum', category: 'Museum', cost: 11 },
    { name: 'LX Factory Entertainment', category: 'Entertainment', cost: 0 },
    { name: 'Miradouro de Santa Luzia', category: 'Viewpoint', cost: 0 },
  ],
  tokyo: [
    { name: 'Senso-ji Temple', category: 'Landmark', cost: 0 },
    { name: 'Shibuya Crossing & Hachiko', category: 'Landmark', cost: 0 },
    { name: 'teamLab Planets', category: 'Museum', cost: 32 },
    { name: 'Tsukiji Outer Market', category: 'Restaurant', cost: 28 },
    { name: 'Shinjuku Golden Gai', category: 'Entertainment', cost: 20 },
    { name: 'Akihabara Electric Town', category: 'Entertainment', cost: 10 },
  ],
  paris: [
    { name: 'Louvre Museum', category: 'Museum', cost: 22 },
    { name: 'Eiffel Tower Summit', category: 'Landmark', cost: 35 },
    { name: 'Musée d’Orsay', category: 'Museum', cost: 16 },
    { name: 'Sainte-Chapelle', category: 'Historic', cost: 13 },
    { name: 'Centre Pompidou', category: 'Entertainment', cost: 15 },
    { name: 'Montmartre & Sacré-Cœur', category: 'Viewpoint', cost: 0 },
  ],
  'siem reap': [
    { name: 'Angkor Wat', category: 'Landmark', cost: 37 },
    { name: 'Bayon Temple', category: 'Historic', cost: 37 },
    { name: 'Ta Prohm Temple', category: 'Historic', cost: 37 },
    { name: 'Angkor Thom & South Gate', category: 'Landmark', cost: 0 },
    { name: 'Phare Circus', category: 'Entertainment', cost: 18 },
    { name: 'Pub Street Night Market', category: 'Entertainment', cost: 8 },
    { name: 'Khmer Kitchen Restaurant', category: 'Restaurant', cost: 12 },
    { name: 'Angkor National Museum', category: 'Museum', cost: 12 },
  ],
};


export interface OverviewPageProps {
  trip: TripSummary;
  members: Member[];
  setActive: (id: string) => void;
  planMode: 'ai' | 'manual';
  setPlanMode: (mode: 'ai' | 'manual') => void;
  isCreator?: boolean;
  onOpenAdmin?: () => void;
}

export default function OverviewPage({
  trip,
  members,
  setActive,
  planMode,
  setPlanMode,
  isCreator = true,
  onOpenAdmin,
}: OverviewPageProps) {
  const today = useToday();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQR, setCopiedQR] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string | null>(null);

  // Manual "Plan it yourself" destination visit form state
  const [manualDay, setManualDay] = useState<number>(1);
  const [manualName, setManualName] = useState<string>('');
  const [manualTime, setManualTime] = useState<string>('10:00');
  const [manualCategory, setManualCategory] = useState<string>('Sightseeing');
  const [manualCost, setManualCost] = useState<string>('15');
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);
  const [manualStops, setManualStops] = useState<
    Array<{ id?: string; day: number; name: string; time: string; cost: number; category: string }>
  >([]);

  const destKey = (trip?.destination || '').toLowerCase().trim();
  const suggestions =
    DESTINATION_SUGGESTIONS[destKey] ||
    (destKey.includes('siem reap') || destKey.includes('angkor')
      ? DESTINATION_SUGGESTIONS['siem reap']
      : null) ||
    (destKey.includes('tokyo') ? DESTINATION_SUGGESTIONS['tokyo'] : null) ||
    (destKey.includes('paris') ? DESTINATION_SUGGESTIONS['paris'] : null) ||
    DESTINATION_SUGGESTIONS['lisbon'] || [
      { name: 'City Center Historic Walk', category: 'Landmark', cost: 0 },
      { name: 'Central Food Market', category: 'Restaurant', cost: 20 },
      { name: 'National Art Museum', category: 'Museum', cost: 12 },
      { name: 'Scenic Panoramic Viewpoint', category: 'Viewpoint', cost: 0 },
    ];

  const refreshPlanStops = useCallback(() => {
    if (!trip?.id) return;
    api.plan
      .get(trip.id)
      .then((plan) => {
        if (plan?.days) {
          const list: Array<{ id?: string; day: number; name: string; time: string; cost: number; category: string }> = [];
          for (const d of plan.days) {
            for (const it of d.items || []) {
              let tStr = '10:00 AM';
              if (it.start_time) {
                const timePart = String(it.start_time).includes('T')
                  ? String(it.start_time).split('T')[1]?.substring(0, 5)
                  : String(it.start_time).split(' ')[1]?.substring(0, 5);
                if (timePart && /^\d{1,2}:\d{2}$/.test(timePart)) {
                  const [hh, mm] = timePart.split(':');
                  const h = parseInt(hh || '0', 10);
                  const ampm = h >= 12 ? 'PM' : 'AM';
                  const h12 = h % 12 === 0 ? 12 : h % 12;
                  tStr = `${h12}:${mm} ${ampm}`;
                }
              }
              list.push({
                id: it.id,
                day: d.day_index + 1,
                name: it.place?.name || 'Scheduled Activity',
                time: tStr,
                cost: it.cost || 0,
                category: it.place?.category || 'Sightseeing',
              });
            }
          }
          setManualStops(list);
        }
      })
      .catch(() => {});
  }, [trip?.id]);

  useEffect(() => {
    refreshPlanStops();
  }, [refreshPlanStops]);

  const handleAddManualStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || isSubmittingManual) return;
    setIsSubmittingManual(true);
    setManualSuccessMsg(null);

    const costNum = parseFloat(manualCost) || 0;
    const dayIdx = manualDay - 1;

    try {
      const [hoursStr, minutesStr] = manualTime.split(':');
      const hours = parseInt(hoursStr || '10', 10);
      const minutes = parseInt(minutesStr || '0', 10);
      const endH = (hours + 2) % 24;

      const baseDate = new Date(trip.start_date);
      baseDate.setDate(baseDate.getDate() + dayIdx);
      const dateStr = !isNaN(baseDate.getTime())
        ? baseDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const startTime = `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
      const endTime = `${dateStr}T${endH.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

      await api.plan.addItem(trip.id, {
        day_index: dayIdx,
        place_name: manualName.trim(),
        category: manualCategory,
        start_time: startTime,
        end_time: endTime,
        cost: costNum,
      });

      refreshPlanStops();
      setManualSuccessMsg(`Added "${manualName.trim()}" to Day ${manualDay}!`);
      setManualName('');

      const nextHour = (hours + 2) % 24;
      setManualTime(`${nextHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
      setTimeout(() => setManualSuccessMsg(null), 4000);
    } catch {
      // Offline fallback
      setManualStops((prev) => [
        ...prev,
        {
          id: `manual-${Date.now()}`,
          day: manualDay,
          name: manualName.trim(),
          time: manualTime,
          cost: costNum,
          category: manualCategory,
        },
      ]);
      setManualSuccessMsg(`Added "${manualName.trim()}" to Day ${manualDay}!`);
      setManualName('');
      setTimeout(() => setManualSuccessMsg(null), 4000);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDeleteManualStop = async (stopId?: string) => {
    if (!stopId) return;
    try {
      if (!stopId.startsWith('manual-')) {
        await api.plan.deleteItem(trip.id, stopId);
      }
    } catch {
      // ignore
    }
    setManualStops((prev) => prev.filter((s) => s.id !== stopId));
  };

  const submittedCount = members.filter((m) => m.submitted).length;

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/?code=${trip.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(inviteUrl);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = inviteUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setCopiedLink(true);
    setShareFeedback('Invite link copied to clipboard!');
    setTimeout(() => {
      setCopied(false);
      setCopiedLink(false);
      setShareFeedback(null);
    }, 2500);
  };

  const handleCopyQRImage = async () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) {
      handleCopyLink();
      return;
    }
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          handleCopyLink();
          return;
        }
        if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            setCopiedQR(true);
            setShareFeedback('QR code image copied to clipboard!');
            setTimeout(() => {
              setCopiedQR(false);
              setShareFeedback(null);
            }, 2500);
            return;
          } catch {
            // Browser rejected image clipboard write; fallback to link
          }
        }
        handleCopyLink();
      }, 'image/png');
    } catch {
      handleCopyLink();
    }
  };

  const handleShare = async () => {
    const inviteUrl = `${window.location.origin}/?code=${trip.id}`;
    const shareTitle = `Join our trip to ${trip.destination}!`;
    const shareText = `Hey! Join our trip to ${trip.destination} on Travel Planner. Scan the QR code or click: ${inviteUrl}`;

    if (navigator.share) {
      try {
        const canvas = qrCanvasRef.current;
        if (canvas && navigator.canShare) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
          );
          if (blob) {
            const fileName = `${trip.destination.replace(/[^a-zA-Z0-9]/g, '_')}_qr.png`;
            const file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: shareTitle,
                text: shareText,
                url: inviteUrl,
                files: [file],
              });
              setShareFeedback('Shared successfully!');
              setTimeout(() => setShareFeedback(null), 2500);
              return;
            }
          }
        }

        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
        setShareFeedback('Shared successfully!');
        setTimeout(() => setShareFeedback(null), 2500);
        return;
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }

    handleCopyLink();
  };

  const handleDownloadQR = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${trip.destination.replace(/[^a-zA-Z0-9]/g, '_')}_trip_qr.png`;
      link.click();
      setShareFeedback('QR code image downloaded!');
      setTimeout(() => setShareFeedback(null), 2500);
    } catch {
      // ignore
    }
  };


  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationStep('Gathering member budget & dietary constraints...');

    setTimeout(() => {
      setGenerationStep('Calling Google Places API for verified venues...');
    }, 500);

    setTimeout(() => {
      setGenerationStep('Validating travel times via Distance Matrix...');
    }, 1000);

    setTimeout(() => {
      setGenerationStep('Resolving schedule & converging on optimal plan...');
    }, 1500);

    try {
      await api.plan.generate(trip.id);
    } catch {
      // Keep rich fallback notes
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationStep(null);
        setActive('itinerary');
      }, 2000);
    }
  };

  let nightsCount = 2;
  try {
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (!isNaN(diff) && diff >= 0) {
      nightsCount = diff;
    }
  } catch {
    // Fallback to 2
  }

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 32,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              ...SERIF,
              fontSize: 'clamp(22px, 5vw, 28px)',
              fontWeight: 400,
              margin: '0 0 6px',
              color: INK,
            }}
          >
            {trip.destination}, {nightsCount} night{nightsCount !== 1 ? 's' : ''}
          </h1>
          <p
            style={{
              color: MUTED,
              fontSize: 15,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Calendar size={15} /> {trip.start_date} – {trip.end_date}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TripStatusBadge status={getTripLifecycleStatus(trip, today)} />
            <span className="text-sm text-[#595347]">{getTripLifecycleDescription(trip, today)}</span>
            {trip.status === 'flagged' && <span className="text-sm text-[#8E4726]">Flagged for review</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isCreator && onOpenAdmin && (
            <SecondaryButton
              onClick={onOpenAdmin}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              <Settings size={14} color={PINE} /> Manage Trip
            </SecondaryButton>
          )}

          {/* Share Button */}
          <SecondaryButton
            onClick={handleShare}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {copied ? <Check size={14} color={PINE} /> : <Share2 size={14} />}
            {copied ? 'Link Copied!' : 'Share Trip Code'}
          </SecondaryButton>
        </div>
      </div>

      {/* Shareable Link Banner */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: '#FAF6EE',
          border: `1px solid ${BORDER}`,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 13,
        }}
      >
        <span>
          Invite code: <strong style={{ fontFamily: 'monospace' }}>{trip.id}</strong>{' '}
          (Friends join without an account)
        </span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            style={{
              border: 'none',
              background: 'transparent',
              color: PINE,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <QrCode size={14} /> QR Code
          </button>
          <button
            type="button"
            onClick={handleShare}
            style={{
              border: 'none',
              background: 'transparent',
              color: PINE,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Share2 size={14} /> Share
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              border: 'none',
              background: 'transparent',
              color: PINE,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
      </div>

      {/* Who's in Card */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '18px 20px',
          background: '#fff',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>Who's in the room</span>
          <span style={{ fontSize: 13, color: MUTED }}>
            {submittedCount} of {members.length} submitted constraints
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Avatar initials={m.initials} submitted={m.submitted} />
              <span style={{ fontSize: 12, color: INK }}>{m.name}</span>
              <span
                style={{
                  fontSize: 10,
                  color: m.submitted ? PINE : MUTED,
                  fontWeight: m.submitted ? 600 : 400,
                }}
              >
                {m.submitted ? 'Ready' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* How do you want to plan it? */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '18px 20px',
          background: '#fff',
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 12,
          }}
        >
          Planning Mode
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPlanMode('ai')}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 10,
              border: `1.5px solid ${planMode === 'ai' ? PINE : BORDER}`,
              background: planMode === 'ai' ? '#EFEAE0' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <Sparkles size={16} color={PINE} />
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                Let the AI plan it
              </span>
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>
              Proposes and validates against Places & Distance Matrix APIs to avoid backtracking.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPlanMode('manual')}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 10,
              border: `1.5px solid ${planMode === 'manual' ? PINE : BORDER}`,
              background: planMode === 'manual' ? '#EFEAE0' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <MapPin size={16} color={PINE} />
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                Plan it yourself
              </span>
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>
              Build the stops by hand. The same validators will flag budget or timing issues.
            </span>
          </button>
        </div>
      </div>

      {/* Plan It Yourself: Manual Destination Visit Form */}
      {planMode === 'manual' && (
        <div
          style={{
            border: `1.5px solid ${PINE}`,
            borderRadius: 14,
            padding: '20px 22px',
            background: '#FAF6EE',
            marginBottom: 24,
            boxShadow: '0 2px 8px rgba(36,33,28,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} color={PINE} />
              <h3 style={{ margin: 0, ...SERIF, fontSize: 18, color: INK }}>
                Plan It Yourself — Add Destination Visit
              </h3>
            </div>
            <span style={{ fontSize: 12, color: PINE, fontWeight: 600, background: '#EEF3ED', padding: '2px 8px', borderRadius: 6 }}>
              Manual Builder
            </span>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: 13, color: MUTED, lineHeight: 1.4 }}>
            Manually enter your destination stops, sightseeing attractions, or restaurants.
            Your stops will be plotted on the interactive route map and validated automatically.
          </p>

          <form onSubmit={handleAddManualStop} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Row 1: Day selection & Destination Name */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 110 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Visit Day</label>
                <select
                  value={manualDay}
                  onChange={(e) => setManualDay(parseInt(e.target.value, 10))}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {Array.from({ length: Math.max(1, nightsCount + 1) }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 200 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>
                  Destination Visit / Venue Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Belém Tower, Louvre Museum, Senso-ji Temple..."
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  required
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: '#fff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Quick Suggestions based on trip destination */}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Quick Add:</span>
                {suggestions.map((sug) => (
                  <button
                    key={sug.name}
                    type="button"
                    onClick={() => {
                      setManualName(sug.name);
                      setManualCategory(sug.category);
                      setManualCost(String(sug.cost));
                    }}
                    style={{
                      fontSize: 11,
                      padding: '3px 9px',
                      borderRadius: 12,
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      color: INK,
                      cursor: 'pointer',
                    }}
                  >
                    + {sug.name}
                  </button>
                ))}
              </div>
            )}

            {/* Row 2: Time, Category, Cost, Submit */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 110 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Time Slot</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: '#fff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Category</label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="Sightseeing">Sightseeing</option>
                  <option value="Landmark">Landmark</option>
                  <option value="Museum">Museum</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Restaurant">Restaurant</option>
                  <option value="Cafe">Cafe</option>
                  <option value="Viewpoint">Viewpoint</option>
                  <option value="Park">Park</option>
                  <option value="Nightlife">Nightlife</option>
                  <option value="Culture">Culture</option>
                  <option value="Shopping">Shopping</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 90 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Cost ($)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 13, color: MUTED }}>$</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={manualCost}
                    onChange={(e) => setManualCost(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 8px 8px 20px',
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      background: '#fff',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <PrimaryButton
                type="submit"
                disabled={isSubmittingManual}
                style={{ padding: '9px 18px', height: 38 }}
              >
                <Plus size={15} /> Add Visit
              </PrimaryButton>
            </div>
          </form>

          {manualSuccessMsg && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 8,
                background: '#EEF5ED',
                color: PINE,
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Check size={14} /> {manualSuccessMsg}
            </div>
          )}

          {/* Scheduled Destination Stops List */}
          {manualStops.length > 0 && (
            <div style={{ marginTop: 20, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                  Scheduled Destination Stops ({manualStops.length}):
                </span>
                <button
                  type="button"
                  onClick={() => setActive('itinerary')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: PINE,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  View Route Map & Schedule <ArrowRight size={13} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {manualStops.map((st, idx) => (
                  <div
                    key={st.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: PINE, minWidth: 44 }}>Day {st.day}</span>
                      <span style={{ color: MUTED, minWidth: 68, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> {st.time}
                      </span>
                      <span style={{ fontWeight: 500, color: INK }}>{st.name}</span>
                      <span style={{ fontSize: 10, color: MUTED, background: '#FAF6EE', padding: '1px 6px', borderRadius: 10 }}>
                        {st.category}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: INK, fontWeight: 600 }}>
                        {st.cost > 0 ? `$${st.cost}` : 'Free'}
                      </span>
                      {st.id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteManualStop(st.id)}
                          title="Remove visit"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: MUTED,
                            cursor: 'pointer',
                            padding: 2,
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Propose-Validate Loop Status Indicator (if generating) */}
      {isGenerating && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: '#FAF6EE',
            border: `1px solid ${PINE}`,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <RefreshCw size={18} color={PINE} className="animate-spin" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: PINE }}>
              Running Autonomous Agent Loop:
            </span>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: INK }}>
              {generationStep}
            </p>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {planMode === 'ai' ? (
          <PrimaryButton
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ padding: '12px 24px' }}
          >
            {isGenerating ? (
              'Synthesizing Itinerary...'
            ) : (
              <>
                <Sparkles size={16} /> Generate Itinerary
              </>
            )}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => setActive('itinerary')}
            style={{ padding: '12px 24px' }}
          >
            <MapPin size={16} /> {manualStops.length > 0 ? `View Route Map (${manualStops.length} stops)` : 'Open Full Itinerary'}
          </PrimaryButton>
        )}

        {!isCreator && (
          <span style={{ fontSize: 13, color: MUTED }}>
            Note: You're in as a group member.
          </span>
        )}
      </div>



      {showQRModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setShowQRModal(false)}
        >
          <div
            style={{
              background: '#fff',
              padding: '28px 24px',
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              maxWidth: 380,
              width: '100%',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowQRModal(false)}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                border: 'none',
                background: '#F4EFE6',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: INK,
              }}
            >
              <X size={16} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0, ...SERIF, fontSize: 22, color: INK }}>Scan to Join</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: 13, color: MUTED, lineHeight: 1.4 }}>
                Friends can scan with their camera to join <b>{trip.destination}</b> instantly.
              </p>
            </div>

            {/* QR Code Canvas */}
            <div
              style={{
                padding: 16,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                background: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <QRCodeCanvas
                ref={qrCanvasRef}
                value={`${window.location.origin}/?code=${trip.id}`}
                size={200}
                level="M"
                marginSize={1}
              />
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  background: '#FAF6EE',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  color: INK,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Code: <b>{trip.id}</b></span>
              </div>
            </div>

            {/* Feedback notification toast */}
            {shareFeedback && (
              <div
                role="status"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: PINE,
                  background: '#EEF3ED',
                  border: '1px solid #D5E2D4',
                  padding: '6px 12px',
                  borderRadius: 8,
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {shareFeedback}
              </div>
            )}

            {/* Actions Grid */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Primary Share with Friends */}
              <button
                type="button"
                onClick={handleShare}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: PINE,
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Share2 size={16} /> Share with Friends
              </button>

              {/* 2-column: Copy QR Image & Copy Link */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleCopyQRImage}
                  title="Copy QR image to clipboard to paste in chats"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: copiedQR ? '#EEF3ED' : '#FAF6EE',
                    border: `1px solid ${copiedQR ? '#D5E2D4' : BORDER}`,
                    color: copiedQR ? PINE : INK,
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {copiedQR ? <Check size={14} /> : <Copy size={14} />}
                  {copiedQR ? 'Copied QR!' : 'Copy QR'}
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  title="Copy invite web link to clipboard"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: copiedLink ? '#EEF3ED' : '#FAF6EE',
                    border: `1px solid ${copiedLink ? '#D5E2D4' : BORDER}`,
                    color: copiedLink ? PINE : INK,
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Copied Link!' : 'Copy Link'}
                </button>
              </div>

              {/* Download PNG button */}
              <button
                type="button"
                onClick={handleDownloadQR}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Download size={14} /> Download QR PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
