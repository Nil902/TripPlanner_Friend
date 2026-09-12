import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AgentExplanations from './AgentExplanations';

describe('AgentExplanations Component', () => {
  it('returns null when notes is empty', () => {
    const { container } = render(<AgentExplanations notes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders organized explanation cards with validation and self-correction', () => {
    const sampleNotes = [
      'Iteration 1: Proposing candidate schedule...',
      'Iteration 1: Validators rejected candidate itinerary with 2 issue(s). Repairing next iteration...',
      '  - [budget] Day 1 cost ($100.00) exceeds group member cap ($50.00) by $50.00 (100.0%).',
      '  - [travel_time] Day 1 has an insufficient transit buffer between two stops.',
      'Iteration 2: Proposing candidate schedule...',
      'Iteration 2: All deterministic validations passed strictly (0 budget warnings, 0 travel warnings).',
    ];

    render(<AgentExplanations notes={sampleNotes} />);

    // Header & summary
    expect(screen.getByText('AI Agent Planning Reasoning & Tradeoffs')).toBeInTheDocument();
    expect(screen.getByText(/How the autonomous planner balanced budget caps/i)).toBeInTheDocument();

    // Summary pillars
    expect(screen.getByText(/Individual caps satisfied/i)).toBeInTheDocument();
    expect(screen.getByText(/Geographic transit buffers/i)).toBeInTheDocument();
    expect(screen.getByText(/Open schedules matched/i)).toBeInTheDocument();

    // Status badges
    expect(screen.getByText(/Self-Corrected/i)).toBeInTheDocument();
    expect(screen.getByText(/Deterministic Validations Passed/i)).toBeInTheDocument();

    // Parsed item titles
    expect(screen.getByText('Resolved Constraint Conflict')).toBeInTheDocument();
    expect(screen.getByText('Optimal Schedule Validated')).toBeInTheDocument();

    // Cleaned human-friendly explanations with de-tagged bullets
    expect(
      screen.getByText(/Validator flagged the following conflict\(s\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/budget: Day 1 cost \(\$100.00\) exceeds group member cap/i),
    ).toBeInTheDocument();
  });

  it('handles constraint relaxation and user refinements', () => {
    const notes = [
      'Reached maximum iterations (5). Applied Section 9.2 Constraint Relaxation: Relaxed daily budget cap by 15% to preserve must-see attractions without dropping key venues.',
      "Refinement requested by user: 'Include scenic viewpoints'",
      "Substituted 'Shop A' with 'Miradouro Viewpoint' (Sightseeing) on Day 1.",
    ];

    render(<AgentExplanations notes={notes} title="Custom Reasoning Title" />);

    expect(screen.getByText('Custom Reasoning Title')).toBeInTheDocument();
    expect(screen.getByText('Tradeoff Applied')).toBeInTheDocument();
    expect(screen.getByText('Budget Cap Relaxed for Must-Sees')).toBeInTheDocument();
    expect(screen.getByText(/Relaxed daily budget ceiling by 15%/i)).toBeInTheDocument();
    expect(screen.getByText('Applied Custom Request: "Include scenic viewpoints"')).toBeInTheDocument();
  });

  it('toggles detailed execution trace when clicked', () => {
    const notes = [
      'Iteration 1: Proposing candidate schedule...',
      'Iteration 1: All deterministic validations passed strictly (0 budget warnings, 0 travel warnings).',
    ];

    render(<AgentExplanations notes={notes} />);

    // Initially collapsed
    expect(screen.queryByText('#1')).not.toBeInTheDocument();

    // Click to expand
    const toggleBtn = screen.getByRole('button', { name: /View detailed execution trace/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText(/Iteration 1: Proposing candidate schedule/i)).toBeInTheDocument();

    // Click to collapse
    const hideBtn = screen.getByRole('button', { name: /Hide detailed execution trace/i });
    fireEvent.click(hideBtn);

    expect(screen.queryByText('#1')).not.toBeInTheDocument();
  });
});
