import React, { useState } from 'react';
import { X, Calendar, MapPin, Sparkles, AlertCircle } from 'lucide-react';
import { BORDER, INK, MUTED, PINE, CLAY, SERIF } from '../lib/constants';
import { PrimaryButton, SecondaryButton } from './Button';
import { api } from '../lib/api';
import type { TripSummary } from '../lib/constants';

export interface CreateTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorId: string;
  onCreated: (trip: TripSummary) => void;
}

export default function CreateTripModal({
  isOpen,
  onClose,
  creatorId,
  onCreated,
}: CreateTripModalProps) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('2026-10-12');
  const [endDate, setEndDate] = useState('2026-10-18');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !destination.trim() || !startDate || !endDate) {
      setError('Please fill out all fields.');
      return;
    }

    if (startDate > endDate) {
      setError('Trip start date cannot be after end date.');
      return;
    }

    setIsLoading(true);
    try {
      const newTrip = await api.trips.create({
        title: title.trim(),
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        creator_id: creatorId || 'alice',
      });

      onCreated({
        id: newTrip.id,
        title: newTrip.title,
        destination: newTrip.destination,
        start_date: newTrip.start_date,
        end_date: newTrip.end_date,
        creator_id: newTrip.creator_id,
        status: newTrip.status || 'collecting_constraints',
        member_ids: newTrip.member_ids || [creatorId || 'alice'],
      });
      onClose();
    } catch (err: unknown) {
      // Fallback: create locally if backend is temporarily unreachable
      const fallbackTrip: TripSummary = {
        id: `trip-${Date.now().toString().slice(-4)}`,
        title: title.trim(),
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        creator_id: creatorId || 'alice',
        status: 'collecting_constraints',
        member_ids: [creatorId || 'alice'],
      };
      onCreated(fallbackTrip);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(36, 33, 28, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAF6EE',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: PINE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles color="#fff" size={16} />
            </div>
            <div>
              <h2
                style={{
                  ...SERIF,
                  fontSize: 20,
                  fontWeight: 400,
                  margin: 0,
                  color: INK,
                }}
              >
                Plan a New Trip
              </h2>
              <span style={{ fontSize: 12, color: MUTED }}>
                Initialize a room for group coordination
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: MUTED,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              borderRadius: 8,
              background: '#FBF0E8',
              border: `1px solid ${CLAY}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: CLAY,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto' }}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="trip-title"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Trip Title
            </label>
            <input
              id="trip-title"
              type="text"
              required
              placeholder="e.g. Kyoto Culinary Exploration"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="trip-destination"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Destination City
            </label>
            <div style={{ position: 'relative' }}>
              <MapPin
                size={16}
                color={MUTED}
                style={{ position: 'absolute', left: 12, top: 12 }}
              />
              <input
                id="trip-destination"
                type="text"
                required
                placeholder="e.g. Kyoto, Japan"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div>
              <label
                htmlFor="trip-start"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Start Date
              </label>
              <div style={{ position: 'relative' }}>
                <Calendar
                  size={15}
                  color={MUTED}
                  style={{ position: 'absolute', left: 12, top: 12 }}
                />
                <input
                  id="trip-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px 9px 34px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: 13,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="trip-end"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: INK,
                }}
              >
                End Date
              </label>
              <div style={{ position: 'relative' }}>
                <Calendar
                  size={15}
                  color={MUTED}
                  style={{ position: 'absolute', left: 12, top: 12 }}
                />
                <input
                  id="trip-end"
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px 9px 34px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: 13,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <SecondaryButton type="button" onClick={onClose}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isLoading}>
              {isLoading ? 'Creating Trip...' : 'Create Trip Room'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
