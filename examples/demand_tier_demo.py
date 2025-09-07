import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import ElasticNet
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.compose import ColumnTransformer
from statsmodels.tsa.statespace.sarimax import SARIMAX

# --- Synthetic Reddit-like post data ---------------------------------------
np.random.seed(42)
num_posts = 200
skus = ["sku_a", "sku_b", "sku_c"]
posts = pd.DataFrame({
    "title": np.random.choice([
        "Great deal on Gadget",
        "New launch leak",
        "Review: Gadget",
        "Discount on Gadget",
    ], size=num_posts),
    "price": np.random.uniform(50, 500, size=num_posts),
    "created_utc": pd.date_range("2024-01-01", periods=num_posts, freq="6H"),
    "subscribers": np.random.randint(10000, 1000000, size=num_posts),
    "score": np.random.randint(0, 500, size=num_posts),
    "sku": np.random.choice(skus, size=num_posts),
})

# --- Feature engineering ----------------------------------------------------
posts["hour"] = posts["created_utc"].dt.hour
posts["dow"] = posts["created_utc"].dt.dayofweek
posts["age_hours"] = (
    posts["created_utc"].max() - posts["created_utc"]
).dt.total_seconds() / 3600
posts["score_per_hour"] = posts["score"] / posts["age_hours"].clip(lower=1.0)
posts["norm_score"] = posts["score_per_hour"] / (
    posts["subscribers"].clip(lower=1_000) / 1_000
)
posts = posts.sort_values("created_utc")
posts["lag7_mean"] = (
    posts.groupby("sku")["norm_score"].rolling(7, min_periods=1).mean().reset_index(0, drop=True)
)

# --- Regression model to predict demand score ------------------------------
feature_cols = ["price", "hour", "dow", "lag7_mean", "title"]
X = posts[feature_cols]
y = posts["norm_score"]
pre = ColumnTransformer([
    ("num", StandardScaler(), ["price", "hour", "dow", "lag7_mean"]),
    ("txt", TfidfVectorizer(min_df=1, ngram_range=(1,2)), "title"),
])
reg_model = Pipeline([
    ("pre", pre),
    ("model", ElasticNet(alpha=0.1, l1_ratio=0.5, random_state=42)),
])
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, shuffle=False
)
reg_model.fit(X_train, y_train)
pred = reg_model.predict(X_test)
print("MAE (regression):", mean_absolute_error(y_test, pred))

# --- Time-series forecast per SKU -----------------------------------------
series = posts.set_index("created_utc")
results = {}
for sku, grp in series.groupby("sku"):
    y_sku = grp["norm_score"]
    model = SARIMAX(y_sku, order=(1,1,1), seasonal_order=(1,0,1,7))
    res = model.fit(disp=False)
    fc = res.get_forecast(steps=7)
    results[sku] = fc.predicted_mean.mean()

# --- Tier mapping ----------------------------------------------------------
pred_scores = pd.Series(results, name="score")
thresh = pred_scores.quantile([0.95, 0.8, 0.5, 0.2])

def to_tier(x):
    if x >= thresh[0.95]:
        return "S"
    if x >= thresh[0.8]:
        return "A"
    if x >= thresh[0.5]:
        return "B"
    if x >= thresh[0.2]:
        return "C"
    return "D"

print("\nTiered SKUs:")
print(pred_scores.apply(to_tier))
