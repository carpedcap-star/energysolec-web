-- Datos iniciales PROVISIONALES. Todo queda marcado como placeholder / no publicado / no verificado.
-- Ejecutar después de las migraciones: supabase db reset  (o psql -f supabase/seed.sql)

insert into calc_params(version, technical, financial, pricing, is_placeholder, active, notes) values (1, '{"moduleWp": 580, "moduleAreaM2": 2.58, "roofM2PerKwp": 6, "groundM2PerKwp": 12, "dcAcRatio": 1.2, "soilingLoss": 0.03, "dcWiringMismatchLoss": 0.025, "acWiringLoss": 0.01, "inverterEfficiency": 0.975, "availability": 0.99, "shadingLoss": {"none": 0, "partial": 0.06, "significant": 0.15}, "firstYearDegradation": 0.01, "annualDegradation": 0.004, "batteryRoundTrip": 0.9, "batteryUsableDoD": 0.9, "defaultDaytimeShare": {"residencial": 0.35, "comercial": 0.65, "industrial": 0.7}, "coverageTarget": 0.9, "gridCo2KgPerKwh": 0.3, "fallbackYield": {"costa": 1150, "sierra": 1250, "amazonia": 1050, "insular": 1400}}'::jsonb, '{"lifetimeYears": 25, "discountRate": 0.1, "omUsdPerKwpYear": 12, "omEscalation": 0.02, "inverterReplacementYear": 13, "inverterReplacementShareOfCapex": 0.1, "batteryReplacementYear": 12, "exportCompensation": "none", "exportPriceUsdPerKwh": 0, "demandSavingsFromPv": false, "scenarios": {"conservador": {"yieldFactor": 0.93, "tariffEscalation": 0, "capexFactor": 1.1, "extraDegradation": 0.002}, "base": {"yieldFactor": 1, "tariffEscalation": 0.01, "capexFactor": 1, "extraDegradation": 0}, "optimista": {"yieldFactor": 1.03, "tariffEscalation": 0.02, "capexFactor": 0.95, "extraDegradation": 0}}, "financing": {"enabled": false, "annualRate": 0.11, "years": 5, "downPayment": 0.3}}'::jsonb, '{"pvTiers": [{"upToKwp": 5, "usdPerKwp": 1150}, {"upToKwp": 20, "usdPerKwp": 980}, {"upToKwp": 100, "usdPerKwp": 840}, {"upToKwp": 500, "usdPerKwp": 720}, {"upToKwp": 1000000000, "usdPerKwp": 640}], "engineeringShare": 0.05, "batteryUsdPerKwh": 480, "vatOnCapex": 0.15, "minimumProjectUsd": 3500}'::jsonb, true, true, 'Valores provisionales iniciales: validar con Gerencia e Ingeniería');

insert into tariffs(code,name,segment,voltage_level,has_demand_charge,energy_blocks,demand_usd_per_kw,commercialization_usd,other_charges_pct,source_note,valid_from,is_placeholder) values ('RES-BT','Residencial baja tensión (referencial)','residencial','BT',false,'[{"from_kwh": 0, "to_kwh": 130, "usd_per_kwh": 0.04}, {"from_kwh": 130, "to_kwh": 500, "usd_per_kwh": 0.092}, {"from_kwh": 500, "to_kwh": null, "usd_per_kwh": 0.105}]'::jsonb,null,1.41,0.1,'PROVISIONAL — valores aproximados de referencia; validar contra el pliego tarifario ARCONEL vigente.',current_date,true);
insert into tariffs(code,name,segment,voltage_level,has_demand_charge,energy_blocks,demand_usd_per_kw,commercialization_usd,other_charges_pct,source_note,valid_from,is_placeholder) values ('COM-BT','Comercial baja tensión sin demanda (referencial)','comercial','BT',false,'[{"from_kwh": 0, "to_kwh": null, "usd_per_kwh": 0.092}]'::jsonb,null,1.41,0.1,'PROVISIONAL — valores aproximados de referencia; validar contra el pliego tarifario ARCONEL vigente.',current_date,true);
insert into tariffs(code,name,segment,voltage_level,has_demand_charge,energy_blocks,demand_usd_per_kw,commercialization_usd,other_charges_pct,source_note,valid_from,is_placeholder) values ('COM-BT-D','Comercial baja tensión con demanda (referencial)','comercial','BT',true,'[{"from_kwh": 0, "to_kwh": null, "usd_per_kwh": 0.09}]'::jsonb,4.79,1.41,0.08,'PROVISIONAL — valores aproximados de referencia; validar contra el pliego tarifario ARCONEL vigente.',current_date,true);
insert into tariffs(code,name,segment,voltage_level,has_demand_charge,energy_blocks,demand_usd_per_kw,commercialization_usd,other_charges_pct,source_note,valid_from,is_placeholder) values ('IND-MT-D','Industrial media tensión con demanda (referencial)','industrial','MT',true,'[{"from_kwh": 0, "to_kwh": null, "usd_per_kwh": 0.08}]'::jsonb,4.79,1.41,0.06,'PROVISIONAL — valores aproximados de referencia; validar contra el pliego tarifario ARCONEL vigente.',current_date,true);

insert into product_categories(slug,name,sort) values ('paneles-solares','Paneles solares',0);
insert into product_categories(slug,name,sort) values ('inversores-on-grid','Inversores On Grid',1);
insert into product_categories(slug,name,sort) values ('inversores-hibridos','Inversores híbridos',2);
insert into product_categories(slug,name,sort) values ('inversores-off-grid','Inversores Off Grid',3);
insert into product_categories(slug,name,sort) values ('baterias-de-litio','Baterías de litio',4);
insert into product_categories(slug,name,sort) values ('sistemas-bess','Sistemas BESS',5);
insert into product_categories(slug,name,sort) values ('kits-solares','Kits solares',6);
insert into product_categories(slug,name,sort) values ('kits-respaldo','Kits de respaldo sin paneles',7);
insert into product_categories(slug,name,sort) values ('estructuras','Estructuras de montaje',8);
insert into product_categories(slug,name,sort) values ('protecciones','Protecciones eléctricas',9);
insert into product_categories(slug,name,sort) values ('cableado','Cableado solar',10);
insert into product_categories(slug,name,sort) values ('conectores','Conectores',11);
insert into product_categories(slug,name,sort) values ('accesorios','Accesorios',12);
insert into product_categories(slug,name,sort) values ('cargadores-ve','Cargadores para vehículos eléctricos',13);
insert into product_categories(slug,name,sort) values ('monitoreo','Equipos de monitoreo',14);
insert into product_categories(slug,name,sort) values ('herramientas','Herramientas para instaladores',15);

insert into brands(slug,name,published,relationship_verified,sort) values ('kaco-new-energy-siemens','KACO New Energy – Siemens',true,false,0);
insert into brands(slug,name,published,relationship_verified,sort) values ('ae-solar','AE Solar',true,false,1);
insert into brands(slug,name,published,relationship_verified,sort) values ('huawei','Huawei',true,false,2);
insert into brands(slug,name,published,relationship_verified,sort) values ('sma','SMA',true,false,3);
insert into brands(slug,name,published,relationship_verified,sort) values ('fronius','Fronius',true,false,4);
insert into brands(slug,name,published,relationship_verified,sort) values ('goodwe','GoodWe',true,false,5);
insert into brands(slug,name,published,relationship_verified,sort) values ('deye','Deye',true,false,6);
insert into brands(slug,name,published,relationship_verified,sort) values ('pylontech','Pylontech',true,false,7);
insert into brands(slug,name,published,relationship_verified,sort) values ('byd','BYD',true,false,8);
insert into brands(slug,name,published,relationship_verified,sort) values ('suntree','Suntree',true,false,9);
insert into brands(slug,name,published,relationship_verified,sort) values ('acesco','ACESCO',true,false,10);
insert into brands(slug,name,published,relationship_verified,sort) values ('alurack','Alurack',true,false,11);

insert into company_stats(label,value,source_note,verified,sort) values ('MWp instalados',0,'PENDIENTE: dato real a ingresar por Gerencia',false,0);
insert into company_stats(label,value,source_note,verified,sort) values ('Proyectos ejecutados',0,'PENDIENTE: dato real a ingresar por Gerencia',false,1);
insert into company_stats(label,value,source_note,verified,sort) values ('Paneles solares instalados',0,'PENDIENTE: dato real a ingresar por Gerencia',false,2);
insert into company_stats(label,value,source_note,verified,sort) values ('Toneladas de CO₂ evitadas',0,'PENDIENTE: dato real a ingresar por Gerencia',false,3);
insert into company_stats(label,value,source_note,verified,sort) values ('Energía generada (MWh)',0,'PENDIENTE: dato real a ingresar por Gerencia',false,4);
insert into company_stats(label,value,source_note,verified,sort) values ('Años de experiencia',0,'PENDIENTE: dato real a ingresar por Gerencia',false,5);
insert into company_stats(label,value,source_note,verified,sort) values ('Clientes atendidos',0,'PENDIENTE: dato real a ingresar por Gerencia',false,6);

insert into projects(slug,title,segment,industry,published) values ('empacreci','Empacreci','industrial','Empacadora',false);
insert into projects(slug,title,segment,industry,published) values ('hotel-los-ceibos','Hotel Los Ceibos','comercial','Hotelería',false);
insert into projects(slug,title,segment,industry,published) values ('importadora-chinatown','Importadora Chinatown','comercial','Comercio',false);
insert into projects(slug,title,segment,industry,published) values ('productos-lacteos-gonzales','Productos Lácteos Gonzáles','industrial','Agroindustria láctea',false);
insert into projects(slug,title,segment,industry,published) values ('esheclabri','ESHECLABRI','industrial','Por definir',false);

insert into site_settings(key, value) values
 ('brand', '{"yellow":"#FDC913","graphite":"#282626","blue":"#0082AA","logo":"/brand/logo.png","logoDark":"/brand/logo-dark.png","font":"Archivo"}'),
 ('contact', '{"whatsapp":"593979655095","whatsappDisplay":"+593 97 965 5095","email":"info@energysolec.com","city":"Guayaquil, Ecuador"}');
