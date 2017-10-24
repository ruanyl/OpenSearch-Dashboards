import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

const sizeToClassNameMap = {
  small: 'kuiLoadingSpinner--small',
  medium: 'kuiLoadingSpinner--medium',
  large: 'kuiLoadingSpinner--large',
  xLarge: 'kuiLoadingSpinner--xLarge',
};

export const SIZES = Object.keys(sizeToClassNameMap);

export const EuiLoadingSpinner = ({ children, size, className, ...rest }) => {
  const classes = classNames(
    'kuiLoadingSpinner',
    sizeToClassNameMap[size],
    className
  );

  return (
    <div
      className={classes}
      {...rest}
    >
      {children}
    </div>
  );
};

EuiLoadingSpinner.propTypes = {
  size: PropTypes.oneOf(SIZES),
};
