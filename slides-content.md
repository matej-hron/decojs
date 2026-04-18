# Slide Text for pressure.html — Presentation Mode

Each section gets a short "billboard" text (1-2 sentences) plus a note on what visual to show.

---

## 1. Dive Profile Terminology (`#dive-profile`)

**EN:** Every dive tells a story in **depth vs. time**. Learn to read the profile and you can talk about any dive.

**CZ:** Kazdy ponor vypraví príbeh v grafu **hloubka vs. cas**. Naucte se císt profil a domluvíte se o jakémkoli ponoru.

**CZ (with diacritics):** Kazdy ponor vypráví príbeh v grafu **hloubka vs. cas**. Naucte se císt profil a domluvíte se o jakémkoli ponoru.

Let me redo CZ properly:

**CZ:** Každý ponor vypráví příběh v grafu **hloubka vs. čas**. Naučte se číst profil a domluvíte se o jakémkoli ponoru.

**Visual:** Dive profile chart + terminology grid (both already present).

---

## 2. Total Pressure Underwater (`#total-pressure`)

**EN:** Every 10 m of depth adds 1 bar. At 30 m you're under **4x the surface pressure**.

**CZ:** Každých 10 m hloubky přidává 1 bar. V 30 m na vás působí **4x větší tlak než na hladině**.

**Visual (no chart exists):** Show the simplified formula as the visual anchor:

```
P = 1 + depth/10  [bar]
```

Pair it with a minimal depth-pressure reference:
- 0 m = 1 bar | 10 m = 2 bar | 20 m = 3 bar | 30 m = 4 bar | 40 m = 5 bar

---

## 3. Dive Profile with Total Pressure (`#pressure-chart`)

**EN:** Watch the pressure axis climb as the diver descends. **Depth and pressure are two sides of the same coin.**

**CZ:** Sledujte, jak osa tlaku stoupá, zatímco potápěč klesá. **Hloubka a tlak jsou dvě strany téže mince.**

**Visual:** Dual Y-axis pressure chart (already present).

---

## 4. Gas Consumption (`#gas-consumption`)

**EN:** At 30 m you breathe **4x more gas** per minute than at the surface. Depth eats your air supply.

**CZ:** V 30 m spotřebujete **4x více plynu** za minutu než na hladině. Hloubka žere zásobu vzduchu.

**Visual (no chart exists):** Show the SAC scaling as the visual anchor:

```
Consumption = SAC x Pressure
Surface:  20 L/min
  10 m:   40 L/min
  20 m:   60 L/min
  30 m:   80 L/min
  40 m:  100 L/min
```

---

## 5. Gas Consumption During Dive (`#gas-consumption-chart`)

**EN:** The chart tracks your **tank pressure in real time**. Plan your gas, plan your dive.

**CZ:** Graf sleduje **tlak v lahvi v reálném čase**. Plánujte plyn, plánujte ponor.

**Visual:** Gas consumption chart + gas summary (both already present).

---

## 6. Air Composition (`#air-composition`)

**EN:** Air = **78% nitrogen, 21% oxygen**, 1% other. Nitrogen is the gas that causes decompression problems.

**CZ:** Vzduch = **78 % dusík, 21 % kyslík**, 1 % ostatní. Dusík je plyn, který způsobuje dekompresní problémy.

**Visual:** Doughnut chart (already present).

---

## 7. Dalton's Law (`#daltons-law`)

**EN:** **Partial pressure = gas fraction x ambient pressure.** At 30 m on air, ppO2 is 0.84 bar and ppN2 is 3.16 bar.

**CZ:** **Parciální tlak = podíl plynu x okolní tlak.** V 30 m na vzduchu je ppO2 = 0,84 bar a ppN2 = 3,16 bar.

**Visual:** Gas particles GIF + the example table showing Air at 30 m (both already present).

---

## 8. Partial Pressure Limits (`#partial-pressure-limits`)

**EN:** **ppO2 above 1.4 bar = danger zone.** More oxygen in your mix means a shallower maximum depth (MOD).

**CZ:** **ppO2 nad 1,4 bar = nebezpečná zóna.** Více kyslíku ve směsi znamená menší maximální operační hloubku (MOD).

**Visual:** ppO2 limits table + MOD formula (both already present). The ppO2 table is the most important visual to keep.

---

## 9. Oxygen Toxicity (`#oxygen-toxicity`)

**EN:** Two threats: **CNS toxicity** (seizures, immediate danger) and **pulmonary toxicity** (long exposure). Remember **VENTID-C**.

**CZ:** Dvě hrozby: **toxicita CNS** (křeče, okamžité nebezpečí) a **plicní toxicita** (dlouhá expozice). Pamatujte si **VENTID-C**.

**Visual:** The two-types comparison table + VENTID-C mnemonic list (both already present). Consider displaying the VENTID-C list prominently as a visual.

---

## 10. Partial Pressures During Dive (`#partial-pressure-chart`)

**EN:** See how **ppO2 and ppN2 rise and fall** with depth. Every gas has its own pressure story during the dive.

**CZ:** Sledujte, jak **ppO2 a ppN2 stoupají a klesají** s hloubkou. Každý plyn má svůj vlastní tlakový příběh během ponoru.

**Visual:** Partial pressure chart (already present).

---

## Summary: Sections Without Charts

For sections **2 (Total Pressure)** and **4 (Gas Consumption)** that have no chart, I recommend keeping one visual element visible on the slide:

| Section | Recommended visual element |
|---------|---------------------------|
| #2 Total Pressure | The simplified formula `P = 1 + depth/10` with a 5-row depth/pressure scale |
| #4 Gas Consumption | The SAC scaling list (Surface: 20 L/min ... 40 m: 100 L/min) |

These are compact enough for a slide while giving the audience something concrete to anchor the presenter's narration.
