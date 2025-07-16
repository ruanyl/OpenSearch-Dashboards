/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LineExclusiveVisOptions, LineStyle } from './exclusive_style';

// Mock the useDebouncedNumericValue hook
jest.mock('../utils/use_debounced_value', () => ({
  useDebouncedNumericValue: jest.fn((value, onChange, options) => {
    return [
      value,
      (newValue: string | number) => {
        // Apply min/max bounds
        let numValue: number;
        if (typeof newValue === 'string') {
          numValue = parseFloat(newValue);
          if (isNaN(numValue)) {
            numValue = options.defaultValue || 0;
          }
        } else {
          numValue = newValue;
        }

        if (options.min !== undefined && numValue < options.min) {
          numValue = options.min;
        }
        if (options.max !== undefined && numValue > options.max) {
          numValue = options.max;
        }

        onChange(numValue);
      },
    ];
  }),
}));

// Mock the StyleAccordion component
jest.mock('../style_panel/style_accordion', () => ({
  StyleAccordion: jest.fn(({ id, accordionLabel, initialIsOpen, children }) => (
    <div data-test-subj="mockStyleAccordion">
      <div data-test-subj="accordionLabel">{accordionLabel}</div>
      <div data-test-subj="accordionContent">{children}</div>
    </div>
  )),
}));

describe('LineExclusiveVisOptions', () => {
  const defaultProps = {
    addTimeMarker: false,
    lineStyle: 'both' as LineStyle,
    lineMode: 'straight',
    lineWidth: 2,
    onAddTimeMarkerChange: jest.fn(),
    onLineModeChange: jest.fn(),
    onLineWidthChange: jest.fn(),
    onLineStyleChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with default props', () => {
    render(<LineExclusiveVisOptions {...defaultProps} />);

    // Check if the component renders with the correct title
    expect(screen.getByTestId('mockStyleAccordion')).toBeInTheDocument();
    expect(screen.getByTestId('accordionLabel')).toHaveTextContent('Line Settings');

    // Check if line style options are rendered
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Line only')).toBeInTheDocument();
    expect(screen.getByText('Dots only')).toBeInTheDocument();

    // Check if line mode options are rendered
    expect(screen.getByText('Straight')).toBeInTheDocument();
    expect(screen.getByText('Smooth')).toBeInTheDocument();
    expect(screen.getByText('Stepped')).toBeInTheDocument();

    // Check if line width control is rendered
    expect(screen.getByLabelText('Line Width')).toBeInTheDocument();

    // Check if time marker switch is rendered
    expect(screen.getByText('Show current time marker')).toBeInTheDocument();
  });

  test('calls onLineStyleChange when line style is changed', () => {
    render(<LineExclusiveVisOptions {...defaultProps} />);

    // Click on "Line only" button
    fireEvent.click(screen.getByText('Line only'));

    // Check if onLineStyleChange was called with the correct value
    expect(defaultProps.onLineStyleChange).toHaveBeenCalledWith('line');

    // Click on "Dots only" button
    fireEvent.click(screen.getByText('Dots only'));

    // Check if onLineStyleChange was called with the correct value
    expect(defaultProps.onLineStyleChange).toHaveBeenCalledWith('dots');

    // Click on "Default" button
    fireEvent.click(screen.getByText('Default'));

    // Check if onLineStyleChange was called with the correct value
    expect(defaultProps.onLineStyleChange).toHaveBeenCalledWith('both');
  });

  test('calls onLineModeChange when line mode is changed', () => {
    render(<LineExclusiveVisOptions {...defaultProps} />);

    // Click on "Smooth" button
    fireEvent.click(screen.getByText('Smooth'));

    // Check if onLineModeChange was called with the correct first parameter
    expect(defaultProps.onLineModeChange.mock.calls[0][0]).toBe('smooth');

    // Click on "Stepped" button
    fireEvent.click(screen.getByText('Stepped'));

    // Check if onLineModeChange was called with the correct first parameter
    expect(defaultProps.onLineModeChange.mock.calls[1][0]).toBe('stepped');

    // Click on "Straight" button
    fireEvent.click(screen.getByText('Straight'));

    // Check if onLineModeChange was called with the correct first parameter
    expect(defaultProps.onLineModeChange.mock.calls[2][0]).toBe('straight');
  });

  test('calls onLineWidthChange when line width is changed', () => {
    render(<LineExclusiveVisOptions {...defaultProps} />);

    // Get the range input
    const rangeInput = screen.getByLabelText('Line Width');

    // Change the value
    fireEvent.change(rangeInput, { target: { value: '5' } });

    // Check if onLineWidthChange was called with the correct value
    expect(defaultProps.onLineWidthChange).toHaveBeenCalledWith(5);
  });

  test('calls onAddTimeMarkerChange when time marker switch is toggled', () => {
    render(<LineExclusiveVisOptions {...defaultProps} />);

    // Get the switch
    const switchElement = screen.getByRole('switch');

    // Toggle the switch
    fireEvent.click(switchElement);

    // Check if onAddTimeMarkerChange was called with the correct value
    expect(defaultProps.onAddTimeMarkerChange).toHaveBeenCalledWith(true);
  });

  test('renders with different initial props', () => {
    const customProps = {
      ...defaultProps,
      addTimeMarker: true,
      lineStyle: 'line' as LineStyle,
      lineMode: 'smooth',
      lineWidth: 5,
    };

    render(<LineExclusiveVisOptions {...customProps} />);

    // Check if the switch is checked
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    // Check if the line width range has the correct value
    expect(screen.getByLabelText('Line Width')).toHaveValue('5');
  });

  test('handles line width min/max constraints', () => {
    render(<LineExclusiveVisOptions {...defaultProps} />);

    // Get the range input
    const rangeInput = screen.getByLabelText('Line Width');

    // Try to set a value below the minimum
    fireEvent.change(rangeInput, { target: { value: '0' } });

    // Check if onLineWidthChange was called with the minimum value (1)
    expect(defaultProps.onLineWidthChange).toHaveBeenCalledWith(1);

    // Try to set a value above the maximum
    fireEvent.change(rangeInput, { target: { value: '15' } });

    // Check if onLineWidthChange was called with the maximum value (10)
    expect(defaultProps.onLineWidthChange).toHaveBeenCalledWith(10);
  });
});
