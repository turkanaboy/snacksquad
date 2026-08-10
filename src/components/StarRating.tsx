import { SNACK_RATINGS, type SnackRating } from "../snackStore";

export function StarRating({ rating, label }: { rating: SnackRating; label: string }) {
  return (
    <span className="star-rating" aria-label={`${label}: ${rating} out of 5 stars`}>
      <b>{label}</b>
      <span className="star-rating-icons" aria-hidden="true">
        {SNACK_RATINGS.map((value) => <span className={value <= rating ? "filled" : ""} key={value}>★</span>)}
      </span>
    </span>
  );
}

export function StarRatingPicker({ value, onChange }: { value: SnackRating | null; onChange: (rating: SnackRating) => void }) {
  return (
    <fieldset className="rating-picker">
      <legend>Your rating</legend>
      <div className="rating-options">
        {SNACK_RATINGS.map((rating) => (
          <button
            type="button"
            className={value !== null && rating <= value ? "selected" : ""}
            aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
            aria-pressed={value === rating}
            onClick={() => onChange(rating)}
            key={rating}
          >
            ★
          </button>
        ))}
      </div>
      <small>{value ? `${value} out of 5 stars` : "Choose 1–5 stars before logging."}</small>
    </fieldset>
  );
}
