import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function Barcode({ value }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: 'CODE39',
        width: 3,
        height: 100,
        margin: 6,
        displayValue: false,
        fontSize: 0,
        background: 'transparent',
      });
    } catch (e) {
      /* ignore invalid values */
    }
  }, [value]);

  return <svg ref={ref} className="block" style={{ width: '100%', height: 'auto' }} />;
}