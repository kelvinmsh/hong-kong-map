# 香港智慧城市地圖

一幅可互動的香港地圖。底圖用 [OpenFreeMap](https://openfreemap.org/) 的免費公開服務。地圖上有十條港鐵重鐵綫，以及運輸署的交通快拍點。

- 點選車站，查看該站即將到站的班次。轉車站會按路綫分開列出。
- 點選快拍點，查看該處最新路面照片。
- 沒有班次或照片時，畫面會寫明原因。

## 資料從哪裡來

| 畫面 | 來源 |
| --- | --- |
| 底圖 | OpenFreeMap Liberty，資料來自 OpenStreetMap |
| 路綫和站名 | [港鐵路綫及車站](https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv) |
| 車站位置 | 地政總署港鐵車站範圍的中心。地圖上標明 Map from Lands Department |
| 到站班次 | [港鐵實時列車服務資訊](https://data.gov.hk/tc-data/dataset/mtr-data2-nexttrain-data) |
| 交通快拍 | [運輸署交通情況快拍圖像](https://data.gov.hk/tc-data/dataset/hk-td-tis_2-traffic-snapshot-images) |

馬場站不在路綫表裡，但到站接口和地政總署資料都有這個站，所以地圖把它畫成東鐵側線。平日列車不經馬場。輕鐵和仍在建造的新站不在這兩個即時來源裡，這版不畫。

色線沿 OpenStreetMap 的港鐵路軌中心線，所以會跟著真實彎位，而不是車站之間的直線。東鐵在上水分岔往羅湖和落馬洲。將軍澳綫在將軍澳分岔往康城。

到站班次只在點開某個車站時向港鐵查詢，不做全港輪詢。側欄開着時，約每 15 秒更新這一站。快拍清單在打開地圖時讀一次，照片在點開後約每兩分鐘換一張。

## 本機運行

需要 Node.js 22.12 或以上。

```bash
npm install
npm run dev
```

開發伺服器在 `http://127.0.0.1:4731`。

```bash
npm test
npm run lint
npm run build
```

若要重新抓取車站座標和路綫：

```bash
npm run data
```

## 正式發佈

驗收通過之後，才發佈到 Cloudflare Workers 免費方案，使用平台提供的 `workers.dev` 網址。靜態網頁不經 Worker 程式轉發政府資料，按 Cloudflare 現時定價，靜態資源請求不計入每日限額，預計費用是 0 美元。

不要購買網域，也不要開啟 Workers 付費方案。若帳戶本身已經是付費方案，帳戶有每月最低 5 美元，這個地圖不會再開新的付費項目。

```bash
npm run build
npx wrangler deploy
```

`wrangler.jsonc` 只發布 `dist` 裡的靜態檔案，沒有 Worker 程式。第一次部署需要登入自己的 Cloudflare 免費帳戶。
