# Observatorio Eléctrico Nacional V4.3

Versión refinada sobre `observatorio-electrico-v4.2-premium` con:
- mapa multicapa restringido a Ecuador con Leaflet
- cruce estructural entre los JSON del proyecto
- tabla técnica de activos y ficha modal por clic
- balance energético 2025, déficit, matriz y pérdidas
- subestaciones críticas como cuellos de botella de red
- expansión, inversión PME y metas sectoriales 2032
- hidrología, lluvia, estiaje y complementariedad de vertientes
- programación de mantenimientos críticos y simulación estructural de apagones
- exportación PDF ejecutivo

## Ejecutar

```bash
npm install
npm run dev
```

## Datos

Ubicados en `public/data/`:
- inventario_activos.json
- Desempeno_y_Balance.json
- Riesgos_Vulnerabilidades_alertas.json
- Plan_Expansion.json
- geografia_activos.json
- lluvias.json
- mantenimiento.json
