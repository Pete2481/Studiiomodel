const { PrismaClient } = require('@prisma/client');
const { addDays, format, startOfDay, subMinutes, addMinutes } = require('date-fns');
const https = require('https');
const prisma = new PrismaClient();

function getWeatherData(lat, lon, start, end) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=sunrise,sunset&timezone=auto`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.daily) resolve({ success: true, daily: parsed.daily });
          else resolve({ success: false });
        } catch (e) { resolve({ success: false }); }
      });
    }).on('error', (err) => resolve({ success: false }));
  });
}

async function main() {
  const tenantId = 'cmjr0qkhw0000c9cwp68q3x2c';
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const hours = tenant.businessHours;

  const startDate = new Date();
  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(addDays(startDate, 13), "yyyy-MM-dd");

  const weatherRes = await getWeatherData(-28.8333, 153.4333, startDateStr, endDateStr);
  
  if (weatherRes.success && weatherRes.daily) {
    await prisma.booking.deleteMany({
      where: {
        tenantId,
        isPlaceholder: true,
        startAt: { gte: startOfDay(startDate) }
      }
    });

    const lastSunriseStr = weatherRes.daily.sunrise[weatherRes.daily.sunrise.length - 1];
    const lastSunsetStr = weatherRes.daily.sunset[weatherRes.daily.sunset.length - 1];

    const placeholdersToCreate = [];

    for (let i = 0; i < 30; i++) {
      const currentDate = addDays(startDate, i);
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const dayOfWeek = currentDate.getDay().toString();
      const config = hours[dayOfWeek];

      if (!config || (!config.sunrise && !config.dusk)) continue;

      let sunriseTime;
      let sunsetTime;

      const sunDataIdx = weatherRes.daily.time.indexOf(dateStr);
      if (sunDataIdx !== -1) {
        sunriseTime = new Date(weatherRes.daily.sunrise[sunDataIdx]);
        sunsetTime = new Date(weatherRes.daily.sunset[sunDataIdx]);
      } else {
        const daysFromLast = i - (weatherRes.daily.time.length - 1);
        const baseSunrise = new Date(lastSunriseStr);
        const baseSunset = new Date(lastSunsetStr);
        
        sunriseTime = new Date(baseSunrise.getTime() + (daysFromLast * 24 * 60 * 60 * 1000));
        sunsetTime = new Date(baseSunset.getTime() + (daysFromLast * 24 * 60 * 60 * 1000));
      }

      for (let s = 0; s < (config.sunrise || 0); s++) {
        placeholdersToCreate.push({
          tenantId,
          title: "SUNRISE SLOT",
          startAt: subMinutes(sunriseTime, 30),
          endAt: addMinutes(sunriseTime, 30),
          status: "REQUESTED",
          isPlaceholder: true,
          slotType: "SUNRISE",
          clientId: null,
          propertyId: null,
          metadata: {}
        });
      }

      for (let d = 0; d < (config.dusk || 0); d++) {
        placeholdersToCreate.push({
          tenantId,
          title: "DUSK SLOT",
          startAt: subMinutes(sunsetTime, 30),
          endAt: addMinutes(sunsetTime, 30),
          status: "REQUESTED",
          isPlaceholder: true,
          slotType: "DUSK",
          clientId: null,
          propertyId: null,
          metadata: {}
        });
      }
    }

    if (placeholdersToCreate.length > 0) {
      await prisma.booking.createMany({ data: placeholdersToCreate });
    }
    console.log(`Hardwired ${placeholdersToCreate.length} slots for 30 days.`);
  }
}

main().finally(() => prisma.$disconnect());

