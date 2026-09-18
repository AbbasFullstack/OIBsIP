export default function StatusBadge({ status }) {
  const palette = {
    Paid: 'badge-veg',
    Pending: 'badge-warn',
    Failed: 'badge-nonveg',
    Refunded: 'badge-neutral',
    Received: 'badge-warn',
    'In Kitchen': 'badge-warn',
    'Sent to Delivery': 'badge-veg',
    Delivered: 'badge-veg',
    Cancelled: 'badge-nonveg',
    'Pending Payment': 'badge-neutral',
  };
  return <span className={`badge ${palette[status] || 'badge-neutral'}`}>{status}</span>;
}